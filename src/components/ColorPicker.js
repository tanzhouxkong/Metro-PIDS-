
import { ref, computed, watch } from 'vue';

export default {
  name: 'ColorPicker',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    initialColor: {
      type: String,
      default: '#000000'
    }
  },
  emits: ['update:modelValue', 'confirm'],
  setup(props, { emit }) {
    const showDialog = computed({
      get: () => props.modelValue,
      set: (val) => emit('update:modelValue', val)
    });

    // 颜色值（十六进制）
    const hexColor = ref(props.initialColor || '#000000');
    
    // RGB 值
    const rgb = ref({ r: 0, g: 0, b: 0 });
    
    // 取色模式：'picker' | 'manual'
    const pickMode = ref('manual');

    // 十六进制转 RGB
    function hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (result) {
        return {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        };
      }
      return { r: 0, g: 0, b: 0 };
    }

    // RGB 转十六进制
    function rgbToHex(r, g, b) {
      return '#' + [r, g, b].map(x => {
        const hex = Math.max(0, Math.min(255, x)).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    }

    // 更新 RGB 值
    function updateRgb() {
      const rgbVal = hexToRgb(hexColor.value);
      rgb.value = rgbVal;
    }

    // 更新十六进制值
    function updateHex() {
      hexColor.value = rgbToHex(rgb.value.r, rgb.value.g, rgb.value.b);
    }

    // 初始化
    watch(() => props.initialColor, (newColor) => {
      if (newColor) {
        hexColor.value = newColor;
        updateRgb();
      }
    }, { immediate: true });

    // 监听十六进制变化
    watch(hexColor, () => {
      updateRgb();
    });

    // 屏幕取色
    const pickColorFromScreen = async () => {
      if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick) {
        try {
          pickMode.value = 'picker';
          const result = await window.electronAPI.startColorPick();
          if (result && result.ok && result.color) {
            hexColor.value = result.color;
            updateRgb();
          }
        } catch (e) {
          console.error('取色失败:', e);
        } finally {
          pickMode.value = 'manual';
        }
      }
    };

    // 确认
    const confirm = () => {
      emit('confirm', hexColor.value);
      showDialog.value = false;
    };

    // 取消
    const cancel = () => {
      showDialog.value = false;
    };

    // 验证十六进制颜色
    const validateHex = (hex) => {
      return /^#?[0-9A-Fa-f]{6}$/.test(hex);
    };

    // 验证 RGB 值
    const validateRgb = (val) => {
      const num = parseInt(val);
      return !isNaN(num) && num >= 0 && num <= 255;
    };

    // 处理粘贴事件
    const handlePaste = (event, inputType) => {
      event.stopPropagation();
      event.preventDefault();
      
      const pastedText = (event.clipboardData || window.clipboardData).getData('text').trim();
      
      if (inputType === 'hex') {
        // 处理十六进制颜色粘贴
        let color = pastedText;
        // 移除可能的 # 符号
        if (color.startsWith('#')) {
          color = color.substring(1);
        }
        // 如果是 3 位十六进制，转换为 6 位
        if (color.length === 3 && /^[0-9A-Fa-f]{3}$/.test(color)) {
          color = color.split('').map(c => c + c).join('');
        }
        // 如果是 6 位十六进制，添加 # 并设置
        if (color.length === 6 && /^[0-9A-Fa-f]{6}$/.test(color)) {
          hexColor.value = '#' + color;
          updateRgb();
        }
      } else if (inputType === 'rgb') {
        // 处理 RGB 值粘贴（格式：255, 128, 64 或 rgb(255, 128, 64)）
        const rgbMatch = pastedText.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (rgbMatch) {
          const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1])));
          const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2])));
          const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3])));
          rgb.value = { r, g, b };
          updateHex();
        }
      }
    };

    // 检查是否有 Electron API
    const hasElectronAPI = computed(() => {
      return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick;
    });

    return {
      showDialog,
      hexColor,
      rgb,
      pickMode,
      pickColorFromScreen,
      confirm,
      cancel,
      updateHex,
      validateHex,
      validateRgb,
      hasElectronAPI,
      handlePaste
    };
  },
  template: `
    <div v-if="showDialog" style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:20000; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px);" @click.self="cancel">
      <div @click.stop @paste.stop style="background:#ffffff; color:#000000; border-radius:12px; padding:24px; width:420px; max-width:90%; box-shadow:0 8px 32px rgba(0,0,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h2 style="margin:0; font-size:20px; font-weight:bold; color:#000000;">选择颜色</h2>
          <button @click="cancel" style="background:none; border:none; color:#666666; cursor:pointer; font-size:24px; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; transition:background 0.2s;" @mouseover="$event.target.style.background='#f0f0f0'" @mouseout="$event.target.style.background='none'">&times;</button>
        </div>

        <!-- 颜色预览 -->
        <div style="margin-bottom:20px;">
          <div :style="{width:'100%', height:'80px', borderRadius:'8px', background:hexColor, border:'2px solid var(--divider)', boxShadow:'0 2px 8px rgba(0,0,0,0.1)'}"></div>
        </div>

        <!-- 十六进制输入 -->
        <div style="margin-bottom:20px;">
          <label style="display:block; font-size:13px; font-weight:bold; color:#666666; margin-bottom:8px;">十六进制 (Hex)</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <input 
              type="text" 
              v-model="hexColor" 
              placeholder="#000000"
              style="flex:1; padding:10px; border-radius:6px; border:1px solid #dddddd; background:#ffffff; color:#000000; font-family:monospace;"
              @input="updateRgb"
              @click.stop
              @paste="handlePaste($event, 'hex')"
            >
            <input 
              type="color" 
              :value="hexColor"
              @input="hexColor = $event.target.value; updateRgb()"
              style="width:50px; height:42px; padding:0; border:none; border-radius:6px; cursor:pointer;"
            >
          </div>
        </div>

        <!-- RGB 输入 -->
        <div style="margin-bottom:20px;">
          <label style="display:block; font-size:13px; font-weight:bold; color:#666666; margin-bottom:8px;">RGB</label>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
            <div>
              <label style="display:block; font-size:11px; color:#666666; margin-bottom:4px;">R</label>
              <input 
                type="number" 
                v-model.number="rgb.r" 
                min="0" 
                max="255"
                @input="updateHex"
                @click.stop
                @paste="handlePaste($event, 'rgb')"
                style="width:100%; padding:8px; border-radius:6px; border:1px solid #dddddd; background:#ffffff; color:#000000;"
              >
            </div>
            <div>
              <label style="display:block; font-size:11px; color:#666666; margin-bottom:4px;">G</label>
              <input 
                type="number" 
                v-model.number="rgb.g" 
                min="0" 
                max="255"
                @input="updateHex"
                @click.stop
                @paste="handlePaste($event, 'rgb')"
                style="width:100%; padding:8px; border-radius:6px; border:1px solid #dddddd; background:#ffffff; color:#000000;"
              >
            </div>
            <div>
              <label style="display:block; font-size:11px; color:#666666; margin-bottom:4px;">B</label>
              <input 
                type="number" 
                v-model.number="rgb.b" 
                min="0" 
                max="255"
                @input="updateHex"
                @click.stop
                @paste="handlePaste($event, 'rgb')"
                style="width:100%; padding:8px; border-radius:6px; border:1px solid #dddddd; background:#ffffff; color:#000000;"
              >
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div style="display:flex; gap:12px; justify-content:flex-end;">
          <button 
            v-if="hasElectronAPI"
            @click="pickColorFromScreen" 
            class="btn" 
            style="background:var(--btn-blue-bg); color:white; padding:10px 16px; border-radius:6px; border:none; font-weight:bold;"
            :disabled="pickMode === 'picker'"
          >
            <i class="fas fa-eye-dropper"></i> 屏幕取色
          </button>
          <button @click="cancel" class="btn" style="background:var(--btn-gray-bg); color:var(--btn-gray-text); padding:10px 16px; border-radius:6px; border:none;">取消</button>
          <button @click="confirm" class="btn" style="background:var(--accent); color:white; padding:10px 16px; border-radius:6px; border:none; font-weight:bold;">确定</button>
        </div>
      </div>
    </div>
  `
}

