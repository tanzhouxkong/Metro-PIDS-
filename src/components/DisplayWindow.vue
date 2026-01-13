<template>
  <div id="display-app" ref="rootRef">
    <div id="scaler">
      <div class="header">
        <div class="h-left">
          <div class="app-title">Metro PIDS</div>
          <div class="line-info">
            <div id="d-line-no" class="line-badge">--</div>
          </div>
        </div>
        <div class="h-next">
          <div class="lbl">
            下一站
            <span class="en">Next Station</span>
          </div>
          <div class="val">
            <span id="d-next-st">--</span>
          </div>
        </div>
        <div class="h-door"></div>
        <div class="h-term">
          <div class="lbl">
            终点站
            <span class="en">Terminal Station</span>
          </div>
          <div class="val">
            --
            <span class="en">--</span>
          </div>
        </div>
      </div>
      <div id="rec-tip">REC</div>
      <div id="d-map" class="btm-map map-l"></div>
      <div id="arrival-screen">
        <div class="as-body">
          <div class="as-panel-left">
            <div class="as-door-area">
              <div class="as-door-graphic">
                <div class="door-arrow l-arrow">
                  <i class="fas fa-chevron-left"></i>
                </div>
                <div class="as-door-img">
                  <i class="fas fa-door-open"></i>
                </div>
                <div class="door-arrow r-arrow">
                  <i class="fas fa-chevron-right"></i>
                </div>
              </div>
              <div class="as-door-text">
                <div id="as-door-msg-cn" class="as-door-t-cn">左侧开门</div>
                <div id="as-door-msg-en" class="as-door-t-en">Left side doors open</div>
              </div>
            </div>
            <div class="as-car-area">
              <div class="as-car-exits"></div>
            </div>
          </div>
            <div class="as-panel-right">
              <div class="as-map-track"></div>
              <div class="as-map-nodes"></div>
            </div>
        </div>
      </div>
      <div id="welcome-end-screen">
        <div class="welcome-end-body"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';
import { initDisplayWindow } from '../utils/displayWindowLogic.js';

const rootRef = ref(null);
let cleanup = () => {};

// 平台检测
const platform = ref('');
const isDarwin = computed(() => platform.value === 'darwin');
const isLinux = computed(() => platform.value === 'linux');

// 获取平台信息
if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.platform) {
  platform.value = window.electronAPI.platform;
}

onMounted(() => {
  cleanup = initDisplayWindow(rootRef.value);
});

onBeforeUnmount(() => {
  if (cleanup) {
  cleanup();
    cleanup = null;
  }
});
</script>
