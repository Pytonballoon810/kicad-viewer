<?php
declare(strict_types=1);
// SPDX-FileCopyrightText: WARP <development@warp.lv>
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\kicad_viewer\AppInfo;

use OCA\kicad_viewer\Listener\LoadViewerListener;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCA\Viewer\Event\LoadViewer;

class Application extends App implements IBootstrap {
	public const APP_ID = 'kicad_viewer';

	public function __construct(array $urlParams = []) {
		parent::__construct(self::APP_ID, $urlParams);
		error_log('DEBUG: kicad_viewer Application constructed (IBootstrap pattern)');
	}

	public function register(IRegistrationContext $context): void {
		error_log('DEBUG: kicad_viewer register() method called');
		$context->registerEventListener(LoadViewer::class, LoadViewerListener::class);
		error_log('DEBUG: kicad_viewer LoadViewer listener registered via IBootstrap');
	}

	public function boot(IBootContext $context): void {
		error_log('DEBUG: kicad_viewer boot() method called');
	}
}
