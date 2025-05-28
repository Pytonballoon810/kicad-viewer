/**
 * SPDX-FileCopyrightText: WARP <development@warp.lv>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {v4 as uuidv4} from 'uuid';
import {generateFilePath} from '@nextcloud/router';
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
      kicanvasEmbed: null,
      src: null,
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
  methods: {
    destruct () {
      // Clean up any created blob URLs
      if (this.src && this.src.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(this.src);
          enhancedLogger.debug('Revoked blob URL');
        } catch (error) {
          enhancedLogger.debug('Error revoking blob URL:', error);
        }
      }
      this.kicanvasEmbed = null;
      this.src = null;
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

        // Create a URL for the kicanvas-embed src
        await this.createKiCadFileUrl(fileContent, fileExtension);

        this.isLoading = false;

        // Initialize KiCanvas reference after the DOM is updated and loading is done
        this.$nextTick(() => {
          this.kicanvasEmbed = this.$el.querySelector('kicanvas-embed');
          enhancedLogger.info('KiCanvas initialized successfully');
        });
      }
      catch (error) {
        enhancedLogger.error('Error loading KiCad file:', error);
        this.isLoading = false;
      }
    },
    async createKiCadFileUrl(fileContent, fileExtension) {
      try {
        enhancedLogger.debug('Creating URL for KiCAD file');
        const mimeType = this.getKiCadMimeType(fileExtension);

        // Try to create a blob URL (preferred method)
        if (!window.kiCanvasBlobUrlsNotSupported) {
          try {
            const blob = new Blob([fileContent], { type: mimeType });
            this.src = URL.createObjectURL(blob);
            enhancedLogger.debug('Created Blob URL for KiCAD file');
            return;
          } catch (err) {
            enhancedLogger.warn('Blob URL creation failed:', err.message);
            window.kiCanvasBlobUrlsNotSupported = true;
          }
        }

        // Fall back to data URL if blob URL fails
        try {
          // Convert to base64
          const bytes = new TextEncoder().encode(fileContent);
          let binary = '';
          const chunkSize = 0x8000; // 32KB chunks to avoid call stack limits
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const base64Content = btoa(binary);
          this.src = `data:${mimeType};base64,${base64Content}`;
          enhancedLogger.debug('Created Data URL for KiCAD file');
        } catch (err) {
          enhancedLogger.error('Failed to create file URL:', err);
          this.src = null;
        }
      } catch (error) {
        enhancedLogger.error('Error creating KiCAD file URL:', error);
        this.src = null;
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
