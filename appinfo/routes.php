<?php
declare(strict_types=1);
// SPDX-FileCopyrightText: WARP <development@warp.lv>
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\kicad_viewer\AppInfo;

return [
    'routes' => [
        [
            'name' => 'file#test',
            'url' => '/test',
            'verb' => 'GET'
        ],
        [
            'name' => 'file#getFile',
            'url' => '/api/file/{path}/{filename}',
            'verb' => 'GET',
            'requirements' => [
                'path' => '.+',
                'filename' => '.+'
            ]
        ],
        [
            'name' => 'file#createPublicToken',
            'url' => '/api/public-token',
            'verb' => 'POST'
        ],
        [
            'name' => 'file#getPublicFile',
            'url' => '/public/{token}',
            'verb' => 'GET'
        ]
    ]
];
