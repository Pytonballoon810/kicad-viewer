<?php
declare(strict_types=1);
// SPDX-FileCopyrightText: WARP <development@warp.lv>
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\kicad_viewer\Listener;

use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Security\CSP\AddContentSecurityPolicyEvent;

class AddCspEventListener implements IEventListener {

	public function handle(Event $event): void {
		if (!($event instanceof AddContentSecurityPolicyEvent)) {
			return;
		}
		$csp = new EmptyContentSecurityPolicy();
		$csp->addAllowedFrameDomain('\'self\'');
		$csp->addAllowedConnectDomain('blob:');
		$csp->addAllowedStyleDomain('https://fonts.googleapis.com');
		$csp->addAllowedFontDomain('https://fonts.gstatic.com');
		$event->addPolicy($csp);
	}
}
