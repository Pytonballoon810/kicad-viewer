<?php
declare(strict_types=1);
// SPDX-FileCopyrightText: WARP <development@warp.lv>
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\kicad_viewer\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\StreamResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

class FileController extends Controller {
    
    private static $publicTokens = [];
    
    public function __construct(string $appName, IRequest $request) {
        parent::__construct($appName, $request);
    }
    
    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     * @PublicPage
     */
    public function test(): StreamResponse {
        return new StreamResponse('Hello from KiCAD Viewer!', Http::STATUS_OK);
    }
    
    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     * @PublicPage
     */
    public function getFile(string $path, string $filename): StreamResponse {
        try {
            // Use global Nextcloud services
            $userSession = \OC::$server->getUserSession();
            $rootFolder = \OC::$server->getRootFolder();
            
            $user = $userSession->getUser();
            if (!$user) {
                return new StreamResponse('User not found', Http::STATUS_UNAUTHORIZED);
            }
            
            $userFolder = $rootFolder->getUserFolder($user->getUID());
            
            // Use filename as the file path since we're passing the same value for both
            $file = $userFolder->get($filename);
            
            if (!$file || $file->getType() !== \OCP\Files\FileInfo::TYPE_FILE) {
                return new StreamResponse('File not found', Http::STATUS_NOT_FOUND);
            }
            
            // Get the file content and MIME type
            $content = $file->getContent();
            $mimeType = $file->getMimeType();
            
            // Create response with proper headers for KiCanvas
            $response = new StreamResponse($content);
            $response->addHeader('Content-Type', $mimeType);
            $response->addHeader('Content-Disposition', 'inline; filename="' . $filename . '"');
            $response->addHeader('Content-Length', (string)strlen($content));
            
            return $response;
            
        } catch (\Exception $e) {
            return new StreamResponse('Server error: ' . $e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }
    
    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function createPublicToken() {
        try {
            $userSession = \OC::$server->getUserSession();
            $user = $userSession->getUser();
            if (!$user) {
                return ['error' => 'User not found'];
            }
            
            $filePath = $this->request->getParam('filePath');
            if (!$filePath) {
                return ['error' => 'File path is required'];
            }
            
            // Create a unique token
            $token = bin2hex(random_bytes(32));
            
            // Store token with file path and user context (expires in 1 hour)
            self::$publicTokens[$token] = [
                'filePath' => $filePath,
                'userId' => $user->getUID(),
                'expires' => time() + 3600
            ];
            
            return ['token' => $token];
            
        } catch (\Exception $e) {
            return ['error' => 'Server error: ' . $e->getMessage()];
        }
    }
    
    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     * @PublicPage
     */
    public function getPublicFile(string $token): StreamResponse {
        try {
            // Check if token exists and is valid
            if (!isset(self::$publicTokens[$token])) {
                return new StreamResponse('Token not found', Http::STATUS_NOT_FOUND);
            }
            
            $tokenData = self::$publicTokens[$token];
            
            // Check if token has expired
            if (time() > $tokenData['expires']) {
                unset(self::$publicTokens[$token]);
                return new StreamResponse('Token expired', Http::STATUS_GONE);
            }
            
            // Get file using stored user context
            $rootFolder = \OC::$server->getRootFolder();
            $userFolder = $rootFolder->getUserFolder($tokenData['userId']);
            $file = $userFolder->get($tokenData['filePath']);
            
            if (!$file || $file->getType() !== \OCP\Files\FileInfo::TYPE_FILE) {
                return new StreamResponse('File not found', Http::STATUS_NOT_FOUND);
            }
            
            // Get the file content and MIME type
            $content = $file->getContent();
            $mimeType = $file->getMimeType();
            
            // Create response with proper headers and CORS for KiCanvas
            $response = new StreamResponse($content);
            $response->addHeader('Content-Type', $mimeType);
            $response->addHeader('Content-Disposition', 'inline; filename="' . $file->getName() . '"');
            $response->addHeader('Content-Length', (string)strlen($content));
            $response->addHeader('Access-Control-Allow-Origin', '*');
            $response->addHeader('Access-Control-Allow-Methods', 'GET');
            $response->addHeader('Access-Control-Allow-Headers', 'Content-Type');
            
            return $response;
            
        } catch (\Exception $e) {
            return new StreamResponse('Server error: ' . $e->getMessage(), Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }
}
