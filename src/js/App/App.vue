<!--
SPDX-FileCopyrightText: WARP <development@warp.lv>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
  <div :class="$style.containApp" :id="`${uuid}`">
    <section :class="$style.containCanvas">
      <div 
        v-show="isLoading" 
        :class="$style.loadingContainer">
        <div :style="{ backgroundImage: `url('${appIconUrl}')` }"></div>
      </div>
      <kicanvas-embed 
        v-show="!isLoading"
        controls="full" 
        :class="$style.kicanvasEmbed">
      </kicanvas-embed>
    </section>
  </div>
</template>

<script
  src="./App.mjs"
></script>

<style
  module
  lang="scss"
  src="./App.module.scss"
></style>
