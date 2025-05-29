<?php
declare(strict_types=1);
// SPDX-FileCopyrightText: WARP <development@warp.lv>
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\kicad_viewer\Migration;

require \OC::$SERVERROOT . "/3rdparty/autoload.php";

use OCP\Migration\IOutput;
use Symfony\Component\Console\Input\StringInput;
use Symfony\Component\Console\Output\ConsoleOutput;

class MimeTypeInstall extends MimeTypeBase
{
	public function getName()
	{
		return 'MIME types for kicad_viewer install';
	}

	private function inFileCache()
	{
		foreach(self::EXT_MIME_MAP as $ext => $mimes){
			// TODO: does NC DB structure can hold one mime for ext, so we should use just the first one from EXT_MIME_MAP, if multiple specified?
			// e.g. $mime = is_array($mimes) ? array_key_first($mimes) : $mimes;
			$mimes = is_array($mimes) ? $mimes : array($mimes);
			foreach($mimes as $mime) {
				$mimeTypeId = $this->mimeTypeLoader->getId($mime);
				$this->mimeTypeLoader->updateFilecache($ext, $mimeTypeId); // FIXME: see NC sources
			}
		}
	}

	private function inConfigFiles()
	{
		$configDir = \OC::$configDir;
		$mimetypemappingFile = $configDir . self::CUSTOM_MIMETYPEMAPPING;
		$mimetypealiasesFile = $configDir . self::CUSTOM_MIMETYPEALIASES;

		$this->appendToFileMapping($mimetypemappingFile, array_merge(self::EXT_MIME_MAP, self::EXT_ICON_EXTRA_MAP));

		// add MIME type aliases for icons, as values use extensions for now
		$this->appendToFileAliases($mimetypealiasesFile, array_merge(self::EXT_MIME_MAP, self::EXT_ICON_EXTRA_MAP));

		$this->updateJS->run(new StringInput(''), new ConsoleOutput());
	}

	private function inIcons()
	{
		$iconNames = array_keys(array_merge(self::EXT_MIME_MAP, self::EXT_ICON_EXTRA_MAP));
		$mimeTypes = array_merge(self::EXT_MIME_MAP, self::EXT_ICON_EXTRA_MAP);
		
		// Source directory for SVG icons
		$iconSourceDir = \OC_App::getAppPath('kicad_viewer') . '/src/img/icons-mime/dist';
		
		// Ensure the source directory exists
		if (!is_dir($iconSourceDir)) {
			// Try fallback to older path structure
			$iconSourceDir = \OC_App::getAppPath('kicad_viewer') . '/img/icons-mime';
			
			// If still not found, log warning and exit
			if (!is_dir($iconSourceDir)) {
				error_log('KiCad Viewer: Icon directory not found, skipping icon registration.');
				return;
			}
		}
		
		// Check if the generic icon exists
		$genericSource = $iconSourceDir . '/gen.svg';
		if (!file_exists($genericSource)) {
			error_log('KiCad Viewer: Generic icon not found: ' . $genericSource);
			return;
		}

		foreach ($iconNames as $iconName)
		{
			// Default to generic icon
			$specificSource = $iconSourceDir . '/' . $iconName . '.svg';
			
			// Create relative path for registration
			$relativeIconPath = 'kicad_viewer/src/img/icons-mime/dist/';
			$relativeIconPath .= file_exists($specificSource) ? $iconName . '.svg' : 'gen.svg';
			
			// Register MIME types with relative paths
			if (isset($mimeTypes[$iconName])) {
				foreach ($mimeTypes[$iconName] as $mime) {
					try {
						\OC::$server->getMimeTypeDetector()->registerType($mime, $relativeIconPath);
					} catch (\Exception $e) {
						error_log('KiCad Viewer: Failed to register MIME type ' . $mime . ' with icon ' . $relativeIconPath);
					}
				}
			}
		}
	}

	public function run(IOutput $output)
	{
		$output->info('Installing MIME types...');
		$this->inIcons();
		$this->inFileCache();
		$this->inConfigFiles();
		$output->info('...done.');
	}
}
