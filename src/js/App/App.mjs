/**
 * SPDX-FileCopyrightText: WARP <development@warp.lv>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {v4 as uuidv4} from 'uuid';
import {generateFilePath, generateUrl} from '@nextcloud/router';
import {APP_ID} from 'configuration/config.mjs';
import {fetchFileFromUrl} from 'helpers/warp-helpers.mjs';
import logger from 'logger/logger.mjs';

// Create enhanced logger that ensures console output
const enhancedLogger = {
  debug: (...args) => {
    console.debug('[KiCAD Viewer]', ...args);
    logger.debug?.(...args);
  },
  info: (...args) => {
    console.info('[KiCAD Viewer]', ...args);
    logger.info?.(...args);
  },
  warn: (...args) => {
    console.warn('[KiCAD Viewer]', ...args);
    logger.warn?.(...args);
  },
  error: (...args) => {
    console.error('[KiCAD Viewer]', ...args);
    logger.error?.(...args);
  }
};

// Check if debug mode is enabled via URL parameter
const isDebugMode = () => {
  return window.location.href.includes('kicad_debug=true') ||
         localStorage.getItem('kicad_viewer_debug') === 'true';
};

// Enable debug mode if requested
if (isDebugMode()) {
  enhancedLogger.info('Debug mode enabled for KiCAD Viewer');
}

// ----------------

export default {
  name: 'App',
  data () {
    return {
      uuid: `uuid-${uuidv4()}`,
      isLoading: true,
      appIconUrl: generateFilePath(APP_ID, '', 'img/app.svg'),
      // Remove all KiCanvas reactive properties to avoid DOMPurify conflicts
      kicanvasFilename: null,
    };
  },
  mounted () {
    this.$nextTick(() => {
      enhancedLogger.info('KiCAD Viewer mounted');
      this.construct();
    });
  },
  beforeDestroy () {
    enhancedLogger.debug('Destroying KiCAD Viewer component');
    this.destruct();
  },
  beforeMount () {
    // Clean up any existing KiCanvas elements before mounting new ones
    this.cleanupKiCanvas();
  },
  methods: {
    cleanupKiCanvas () {
      try {
        // Find and remove any existing kicanvas-embed elements to prevent ShadowDOM conflicts
        const existingEmbeds = document.querySelectorAll('kicanvas-embed');
        existingEmbeds.forEach((embed, index) => {
          enhancedLogger.debug(`Removing existing KiCanvas embed element ${index}`);
          
          // Disconnect any observers or cleanup internal state
          if (typeof embed.disconnect === 'function') {
            embed.disconnect();
          }
          if (typeof embed.cleanup === 'function') {
            embed.cleanup();
          }
          
          // Remove from DOM completely
          embed.remove();
        });
        
        enhancedLogger.debug(`Cleaned up ${existingEmbeds.length} existing KiCanvas elements`);
      } catch (error) {
        enhancedLogger.debug('Error during KiCanvas cleanup:', error);
      }
    },
    destruct () {
      // Clean up observer
      if (this.loadingObserver) {
        this.loadingObserver.disconnect();
        this.loadingObserver = null;
      }
      this.cleanupKiCanvas();
    },
    hideKiCanvasLoadingElements(embedElement) {
      try {
        enhancedLogger.debug('Aggressively hiding KiCanvas loading elements');
        
        // List of selectors that might be loading elements
        const loadingSelectors = [
          '[class*="loading"]',
          '[class*="spinner"]',
          '[id*="loading"]',
          '[id*="spinner"]',
          '.kc-loading',
          '.kc-spinner',
          '.loading',
          '.spinner',
          '.loading-overlay',
          '.progress',
          '[data-loading]',
          '[loading]'
        ];
        
        // Try to access shadow root if possible
        let elementsToSearch = [embedElement];
        if (embedElement.shadowRoot) {
          elementsToSearch.push(embedElement.shadowRoot);
          enhancedLogger.debug('Found KiCanvas shadow root, searching inside');
        }
        
        let hiddenCount = 0;
        elementsToSearch.forEach(root => {
          loadingSelectors.forEach(selector => {
            try {
              const elements = root.querySelectorAll(selector);
              elements.forEach(el => {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('opacity', '0', 'important');
                hiddenCount++;
              });
            } catch (e) {
              // Ignore selector errors
            }
          });
        });
        
        enhancedLogger.debug(`Hidden ${hiddenCount} potential loading elements in KiCanvas`);
      } catch (error) {
        enhancedLogger.debug('Error hiding KiCanvas loading elements:', error);
      }
    },
    setupKiCanvasLoadingObserver(embedElement) {
      try {
        enhancedLogger.debug('Setting up KiCanvas loading observer');
        
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Check if the added node or its children contain loading elements
                const element = node;
                if (element.className && (
                  element.className.includes('loading') || 
                  element.className.includes('spinner')
                )) {
                  enhancedLogger.debug('Detected new loading element, hiding it');
                  element.style.setProperty('display', 'none', 'important');
                  element.style.setProperty('visibility', 'hidden', 'important');
                  element.style.setProperty('opacity', '0', 'important');
                }
              }
            });
          });
        });
        
        // Observe the KiCanvas element
        observer.observe(embedElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style']
        });
        
        // Store observer for cleanup
        this.loadingObserver = observer;
        
        enhancedLogger.debug('KiCanvas loading observer set up successfully');
      } catch (error) {
        enhancedLogger.debug('Error setting up KiCanvas loading observer:', error);
      }
    },
    async construct () {
      this.isLoading = true;
      enhancedLogger.info('Constructing KiCAD Viewer');

      try {
        // Get the KiCad file to display
        const fileFetchUrl = this.source || this.davPath;
        const fileBasename = this.basename;
        const fileExtension = fileBasename.split('.').pop().toLowerCase();

        enhancedLogger.debug('Loading file:', fileFetchUrl);
        enhancedLogger.debug('File type detected:', fileExtension);

        // Fetch the file content
        const fileContent = await this.fetchKiCadFile(
          fileFetchUrl,
          fileBasename,
        );

        enhancedLogger.debug('File content loaded, length:', fileContent.length);

        // Initialize KiCanvas with improved error handling
        await this.initKiCanvas(fileContent, fileExtension);
      }
      catch (error) {
        enhancedLogger.error('Error loading KiCad file:', error);
        this.showErrorAndStopLoading('Failed to load KiCad file: ' + error.message);
      }
    },
    async initKiCanvas(fileContent, fileExtension) {
      enhancedLogger.info('=== Starting KiCanvas initialization ===');
      
      try {
        const mimeType = this.getKiCadMimeType(fileExtension);
        
        // Set filename for Vue binding
        this.kicanvasFilename = this.basename;
        
        enhancedLogger.debug('File info for KiCanvas:', {
          contentLength: fileContent.length,
          type: mimeType,
          filename: this.basename,
          format: fileExtension
        });

        // Wait for Vue to update the DOM
        await this.$nextTick();
        
        // Wait a bit more to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const embedElement = document.querySelector('kicanvas-embed');
        if (!embedElement) {
          throw new Error('KiCanvas embed element not found in DOM');
        }

        // Use existing route with public access parameter
        let filename = this.filename || this.basename;
        
        // Remove leading slash if present (like /smart_cancrusher.kicad_sch -> smart_cancrusher.kicad_sch)
        if (filename.startsWith('/')) {
          filename = filename.substring(1);
        }
        enhancedLogger.debug('Setting KiCanvas src to public API endpoint:', filename);
        
        // Use the existing /api/file/ route which should work
        const publicUrl = `/apps/kicad_viewer/api/file/public/${encodeURIComponent(filename)}`;
        enhancedLogger.debug('Setting KiCanvas src to:', publicUrl);
        
        // Use proper KiCanvas API for direct content
        embedElement.textContent = fileContent;
        embedElement.setAttribute('data-content', fileContent);
        
        // Configure KiCanvas for standalone mode - prevent loading dependent files
        embedElement.setAttribute('standalone', 'true');
        embedElement.setAttribute('base-url', '');
        embedElement.setAttribute('disable-hierarchical-loading', 'true');
        
        // Disable KiCanvas's own loading UI and spinners
        embedElement.setAttribute('disable-loading-ui', 'true');
        embedElement.setAttribute('hide-loading-spinner', 'true');
        embedElement.setAttribute('loading', 'false');
        embedElement.setAttribute('show-loading', 'false');
        
        // Try KiCanvas API methods to trigger content parsing
        try {
          // Method 1: Use initialContentCallback if available
          if (typeof embedElement.initialContentCallback === 'function') {
            enhancedLogger.debug('Calling initialContentCallback');
            embedElement.initialContentCallback();
          }
          
          // Method 2: Use WebDAV URL directly - KiCanvas can fetch it and recognize file extension
          if ('src' in embedElement) {
            enhancedLogger.debug('Setting src property to WebDAV URL for standalone mode');
            embedElement.src = this.davPath;
            
            // Configure standalone mode properties
            if ('baseUrl' in embedElement) {
              embedElement.baseUrl = '';
              enhancedLogger.debug('Set baseUrl to empty for standalone mode');
            }
            if ('allowHierarchicalLoading' in embedElement) {
              embedElement.allowHierarchicalLoading = false;
              enhancedLogger.debug('Disabled hierarchical loading');
            }
            
            enhancedLogger.debug('Set src to WebDAV URL for standalone mode:', this.davPath);
          }
          
          // Method 3: Call render method if available
          if (typeof embedElement.render === 'function') {
            enhancedLogger.debug('Calling render method');
            embedElement.render();
          }
          
          enhancedLogger.debug('Used KiCanvas API methods with standalone configuration');
          
        } catch (error) {
          enhancedLogger.error('KiCanvas API methods failed:', error.message);
        }
        
        enhancedLogger.debug('Set KiCanvas embed src to API URL:', {
          src: embedElement.getAttribute('src'),
          controls: embedElement.getAttribute('controls'),
          tagName: embedElement.tagName
        });

        enhancedLogger.debug('Content loaded successfully, stopping loading spinner');
        enhancedLogger.debug('Before setting isLoading = false. Current value:', this.isLoading);
        this.isLoading = false;
        enhancedLogger.debug('After setting isLoading = false. New value:', this.isLoading);
        
        // Force Vue to update immediately
        await this.$nextTick();
        enhancedLogger.debug('Vue nextTick completed, isLoading should be updated in DOM');
        
        // Check Vue DOM state immediately
        enhancedLogger.debug('Checking Vue DOM state after isLoading = false');
        const loadingElement = document.querySelector('.loadingContainer');
        const kicanvasElement = document.querySelector('kicanvas-embed');
        
        enhancedLogger.debug('Loading element:', {
          exists: !!loadingElement,
          style: loadingElement?.style?.cssText || 'none',
          display: loadingElement?.style?.display || 'default',
          hasDisplayNone: loadingElement?.style?.cssText?.includes('display: none') || false
        });
        
        enhancedLogger.debug('KiCanvas element:', {
          exists: !!kicanvasElement,
          style: kicanvasElement?.style?.cssText || 'none', 
          display: kicanvasElement?.style?.display || 'default',
          hasDisplayNone: kicanvasElement?.style?.cssText?.includes('display: none') || false
        });
        
        // Force Vue reactivity update
        enhancedLogger.debug('Forcing Vue update to ensure reactivity works');
        this.$forceUpdate();
        
        // Manual DOM manipulation as fallback - target the correct Vue elements
        setTimeout(() => {
          // Find loading element - it has CSS module class, so search by tag structure
          const appContainer = document.querySelector(`#${this.uuid}`);
          const loadingEl = appContainer?.querySelector('div[class*="loadingContainer"]');
          const kicanvasEl = appContainer?.querySelector('kicanvas-embed');
          
          enhancedLogger.debug('Found elements:', {
            appContainer: !!appContainer,
            loadingEl: !!loadingEl,
            kicanvasEl: !!kicanvasEl,
            loadingElClasses: loadingEl?.className,
            kicanvasElClasses: kicanvasEl?.className
          });
          
          if (loadingEl) {
            enhancedLogger.debug('Manually hiding loading element via style.display');
            loadingEl.style.setProperty('display', 'none', 'important');
            loadingEl.style.setProperty('visibility', 'hidden', 'important');
            loadingEl.style.setProperty('opacity', '0', 'important');
            loadingEl.style.setProperty('pointer-events', 'none', 'important');
            // Also add a CSS class to ensure it's hidden
            loadingEl.classList.add('force-hidden');
          }
          
          if (kicanvasEl) {
            enhancedLogger.debug('Manually showing KiCanvas element');
            kicanvasEl.style.display = 'block';
            kicanvasEl.style.visibility = 'visible';
          }
          
          enhancedLogger.debug('After manual DOM updates:', {
            loadingHidden: loadingEl?.style?.display === 'none',
            kicanvasVisible: kicanvasEl?.style?.display !== 'none'
          });
        }, 50);
        
        // Give KiCanvas a moment to render, then aggressively hide loading elements
        setTimeout(() => {
          try {
            const embed = embedElement;
            enhancedLogger.debug('Checking KiCanvas embed element:', embed?.tagName, 'Update method available:', typeof embed?.update);
            
            // Try multiple approaches to force KiCanvas refresh
            if (embed) {
              // Approach 1: Call update if available
              if (typeof embed.update === 'function') {
                embed.update();
                enhancedLogger.debug('Called KiCanvas update method');
              }
              
              // Approach 2: Dispatch custom events that KiCanvas might listen for
              const events = ['load', 'change', 'input', 'kicanvas-refresh'];
              events.forEach(eventType => {
                try {
                  embed.dispatchEvent(new Event(eventType, { bubbles: true }));
                  enhancedLogger.debug(`Dispatched ${eventType} event on embed`);
                } catch (e) {
                  // Ignore event dispatch errors
                }
              });
              
              // Approach 3: Aggressively hide any loading elements within KiCanvas
              this.hideKiCanvasLoadingElements(embed);
              
              // Approach 4: Force DOM mutation by temporarily removing/adding an attribute
              setTimeout(() => {
                try {
                  const tempAttr = 'data-refresh';
                  embed.setAttribute(tempAttr, Date.now().toString());
                  setTimeout(() => embed.removeAttribute(tempAttr), 10);
                  enhancedLogger.debug('Forced DOM mutation to trigger KiCanvas refresh');
                } catch (e) {
                  // Ignore mutation errors
                }
              }, 100);
              
              // Log current sources state
              const sources = embed.querySelectorAll('kicanvas-source');
              enhancedLogger.debug('KiCanvas sources after refresh attempts:', sources.length);
            }
          } catch (e) {
            enhancedLogger.debug('KiCanvas refresh attempts failed:', e.message);
          }
        }, 300);
        
        // Set up a MutationObserver to catch any loading elements that appear later
        this.setupKiCanvasLoadingObserver(embedElement);
        
        enhancedLogger.info('=== KiCanvas initialization completed successfully ===');
        
      } catch (error) {
        enhancedLogger.error('=== KiCanvas initialization failed ===', error);
        this.showErrorAndStopLoading('Failed to initialize KiCanvas: ' + error.message);
      }
    },
    
    getKiCadMimeType(extension) {
      // Map KiCad file extensions to appropriate mime types
      const mimeMap = {
        'kicad_pcb': 'application/x-kicad-pcb',
        'kicad_sch': 'application/x-kicad-schematic',
        'kicad_pro': 'application/x-kicad-project',
        'kicad_wks': 'application/x-kicad-workspace',
        'kicad_mod': 'application/x-kicad-footprint',
        'kicad_sym': 'application/x-kicad-symbol'
      };

      return mimeMap[extension] || 'text/plain';
    },
    async loadContentIntoKiCanvasEmbed(embedElement, fileContent, fileExtension, mimeType) {
      enhancedLogger.debug('Starting loadContentIntoKiCanvasEmbed with file extension:', fileExtension);
      enhancedLogger.debug('File content length:', fileContent.length);

      // Try direct content methods first (CSP-safe)
      enhancedLogger.debug('Checking KiCanvas direct content methods');
      const directMethods = Object.getOwnPropertyNames(embedElement.__proto__).filter(p => typeof embedElement[p] === 'function');
      enhancedLogger.debug('Available KiCanvas methods:', directMethods);

      // Approach 1: Try direct content setting methods
      const contentMethods = ['setContent', 'loadFromString', 'loadContent', 'setSource', 'setData'];
      for (const methodName of contentMethods) {
        if (typeof embedElement[methodName] === 'function') {
          try {
            enhancedLogger.debug(`Trying direct method: ${methodName}`);
            await embedElement[methodName](fileContent);
            enhancedLogger.debug(`Direct method ${methodName} successful`);
            return true;
          } catch (error) {
            enhancedLogger.debug(`Direct method ${methodName} failed:`, error.message);
          }
        }
      }

      // Approach 2: Try setting src with data URL (might work in some contexts)
      try {
        enhancedLogger.debug('Trying data URL approach as fallback');
        const base64Content = this.encodeUtf8ToBase64(fileContent);
        const dataUrl = `data:${mimeType};base64,${base64Content}`;
        
        embedElement.setAttribute('src', dataUrl);
        
        enhancedLogger.debug('Set embed src attribute with data URL');
        return true;
      } catch (error) {
        enhancedLogger.debug('Data URL approach failed:', error.message);
      }

      // Approach 3: Try creating a temporary blob and setting it directly
      try {
        enhancedLogger.debug('Trying direct blob assignment');
        const blob = new Blob([fileContent], { type: mimeType });
        
        // Try setting various blob properties
        if ('src' in embedElement) {
          embedElement.src = blob;
        }
        if ('content' in embedElement) {
          embedElement.content = fileContent;
        }
        if ('data' in embedElement) {
          embedElement.data = fileContent;
        }
        
        enhancedLogger.debug('Direct blob assignment attempted');
        return true;
      } catch (error) {
        enhancedLogger.debug('Direct blob assignment failed:', error.message);
      }

      enhancedLogger.error('All content loading approaches failed - CSP restrictions prevent URL-based loading');
      return false;
    },

    tryBlobUrl(sourceElement, fileContent, fileExtension, mimeType) {
      enhancedLogger.debug('Trying blob URL approach');
      
      try {
        const blob = new Blob([fileContent], { type: mimeType });
        const fileUrl = URL.createObjectURL(blob);
        
        enhancedLogger.debug('Created blob URL:', fileUrl, 'Blob size:', blob.size, 'Mime type:', mimeType);
        
        sourceElement.setAttribute('src', fileUrl);
        sourceElement.setAttribute('type', mimeType);
        sourceElement.setAttribute('name', this.basename);
        sourceElement.setAttribute('data-format', fileExtension);
        
        enhancedLogger.debug('Set attributes on source element:', {
          src: sourceElement.getAttribute('src'),
          type: sourceElement.getAttribute('type'),
          name: sourceElement.getAttribute('name'),
          format: sourceElement.getAttribute('data-format')
        });
        
        // Clean up the URL after a reasonable time
        setTimeout(() => {
          try {
            URL.revokeObjectURL(fileUrl);
            enhancedLogger.debug('Blob URL cleaned up');
          } catch (e) {
            // Ignore cleanup errors
          }
        }, 60000);
        
        return true;
      } catch (error) {
        enhancedLogger.error('Blob URL approach failed:', error);
        throw error;
      }
    },

    tryScriptTag(sourceElement, fileContent, fileExtension, mimeType) {
      enhancedLogger.debug('Trying script tag approach');
      
      // Clear any existing content
      sourceElement.innerHTML = '';
      
      // Create script tag with content
      const script = document.createElement('script');
      script.type = mimeType;
      script.textContent = fileContent;
      
      // Set attributes on source element
      sourceElement.setAttribute('type', mimeType);
      sourceElement.setAttribute('data-format', fileExtension);
      sourceElement.setAttribute('name', this.basename);
      
      // Append script to source
      sourceElement.appendChild(script);
      
      enhancedLogger.debug('Set script tag with attributes:', {
        sourceType: sourceElement.getAttribute('type'),
        sourceName: sourceElement.getAttribute('name'),
        sourceFormat: sourceElement.getAttribute('data-format'),
        scriptType: script.type,
        scriptContentLength: script.textContent?.length || 0,
        totalChildren: sourceElement.children.length
      });
      
      return true;
    },

    tryTextContent(sourceElement, fileContent, fileExtension, mimeType) {
      enhancedLogger.debug('Trying text content approach');
      
      sourceElement.textContent = fileContent;
      sourceElement.setAttribute('type', mimeType);
      sourceElement.setAttribute('data-format', fileExtension);
      sourceElement.setAttribute('name', this.basename);
      
      enhancedLogger.debug('Set text content with attributes:', {
        type: sourceElement.getAttribute('type'),
        name: sourceElement.getAttribute('name'),
        format: sourceElement.getAttribute('data-format'),
        contentLength: sourceElement.textContent?.length || 0
      });
      
      return true;
    },

    tryDataUrl(sourceElement, fileContent, fileExtension, mimeType) {
      if (fileContent.length > 1000000) {
        throw new Error('File too large for data URL approach');
      }
      
      enhancedLogger.debug('Trying data URL approach');
      
      const base64Content = this.encodeUtf8ToBase64(fileContent);
      const dataUrl = `data:${mimeType};base64,${base64Content}`;
      
      sourceElement.setAttribute('src', dataUrl);
      sourceElement.setAttribute('type', mimeType);
      sourceElement.setAttribute('name', this.basename);
      sourceElement.setAttribute('data-format', fileExtension);
      
      return true;
    },

    tryDirectContent(sourceElement, fileContent) {
      enhancedLogger.debug('Trying direct content setting');
      
      if (typeof sourceElement.setContent !== 'function') {
        throw new Error('setContent method not available');
      }
      
      sourceElement.setContent(fileContent);
      return true;
    },

    showErrorAndStopLoading(message) {
      enhancedLogger.error('Showing error and stopping loading:', message);
      this.isLoading = false;
      
      // Show error message to user - could enhance this with a proper error UI
      console.error('[KiCAD Viewer Error]', message);
      
      // Optionally show an alert for now (could be replaced with better UI)
      if (isDebugMode()) {
        alert('KiCAD Viewer Error: ' + message);
      }
    },
    encodeUtf8ToBase64(str) {
      // Convert string to UTF-8 bytes
      const utf8Bytes = new TextEncoder().encode(str);
      
      // Convert bytes to base64 using built-in methods
      // Create a binary string from the bytes, ensuring each byte stays in Latin1 range
      let binaryString = '';
      for (let i = 0; i < utf8Bytes.length; i++) {
        binaryString += String.fromCharCode(utf8Bytes[i]);
      }
      
      // Now encode to base64
      return btoa(binaryString);
    },
    async fetchKiCadFile (url, filename) {
      try {
        enhancedLogger.debug('Fetching KiCad file from URL:', url);

        // Try a direct fetch first for maximum compatibility
        try {
          const response = await fetch(url);
          if (response.ok) {
            const text = await response.text();
            enhancedLogger.debug('File fetched successfully via fetch API');
            return text;
          }
        } catch (err) {
          enhancedLogger.debug('Direct fetch failed, falling back to fetchFileFromUrl:', err);
        }

        // Fall back to helper method
        const file = await fetchFileFromUrl(url, filename);
        enhancedLogger.debug('File fetched successfully via helper');
        return await file.text();
      } catch (error) {
        enhancedLogger.error('Error fetching KiCad file:', error);
        throw error;
      }
    }
  }
};
