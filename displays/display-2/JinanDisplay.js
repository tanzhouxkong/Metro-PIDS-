import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

export default {
  name: 'JinanDisplay',
  setup() {
    // ============ 响应式数据 ============
    const appData = ref(null)
    const rt = ref({ idx: 0, state: 0 }) // 0=Arr, 1=Run
    const scaleRatio = ref(1)
    const platform = ref('')
    const isDarwin = computed(() => platform.value === 'darwin')
    const isLinux = computed(() => platform.value === 'linux')

    // BroadcastChannel
    let bc = null
    let bcNew = null

    // ============ 计算属性 ============
    const stations = computed(() => {
      return appData.value?.stations || []
    })

    // 颜色标记解析：将 <color>文字</> 转为带颜色的 HTML
    const parseColorMarkup = (text) => {
      if (!text || typeof text !== 'string') return text
      const regex = /<([^>]+)>([^<]*)<\/>/g
      let result = text
      let match
      const colorNames = {
        red: 'red',
        blue: 'blue',
        green: 'green',
        yellow: 'yellow',
        orange: 'orange',
        purple: 'purple',
        pink: 'pink',
        black: 'black',
        white: 'white',
        gray: 'gray',
        grey: 'grey',
        brown: 'brown',
        cyan: 'cyan',
        magenta: 'magenta',
        lime: 'lime',
        navy: 'navy',
        olive: 'olive',
        teal: 'teal',
        aqua: 'aqua',
        silver: 'silver',
        maroon: 'maroon',
        fuchsia: 'fuchsia'
      }
      while ((match = regex.exec(text)) !== null) {
        const colorValue = match[1].trim()
        const content = match[2]
        const fullMatch = match[0]
        let cssColor = ''
        if (colorNames[colorValue.toLowerCase()]) {
          cssColor = colorNames[colorValue.toLowerCase()]
        } else if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(colorValue)) {
          cssColor = colorValue
        } else if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/.test(colorValue)) {
          cssColor = colorValue
        }
        if (cssColor) {
          const escapedContent = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
          const coloredSpan = `<span style="color:${cssColor};">${escapedContent}</span>`
          result = result.replace(fullMatch, coloredSpan)
        }
      }
      return result
    }

    // 去除颜色标记，保留纯文本
    const stripColorMarkup = (text) => {
      if (!text || typeof text !== 'string') return text
      return text.replace(/<[^>]+>([^<]*)<\/>/g, '$1')
    }

    const rawLineName = computed(() => appData.value?.meta?.lineName || '--')

    const lineNameHTML = computed(() => parseColorMarkup(rawLineName.value))

    const lineNumber = computed(() => {
      const plain = stripColorMarkup(rawLineName.value)
      const num = plain.replace(/[^0-9A-Za-z]/g, '')
      return num || plain || '--'
    })

    // 路线信息：路线号
    const routeNumber = computed(() => {
      return lineNumber.value || '--'
    })

    // 路线方向：起始站 → 终点站
    const routeDirection = computed(() => {
      if (stations.value.length === 0) return '-- → --'
      const startStation = stations.value[0]?.name || '--'
      const endStation = stations.value[stations.value.length - 1]?.name || '--'
      return `${startStation} → ${endStation}`
    })

    // 当前活动站点索引
    const activeStationIdx = computed(() => {
      if (stations.value.length === 0) return 0
      if (rt.value.state === 1) {
        // 运行中，指向下一站
        return Math.min(rt.value.idx + 1, stations.value.length - 1)
      }
      // 到站状态，指向当前站
      return rt.value.idx
    })

    // 地图相关计算
    const SCREEN_WIDTH = 1500 // 屏幕宽度
    const PADDING = 40 // 左右内边距
    const PADDING_LEFT = 20 // 左边距（用于站点）
    const PADDING_RIGHT = 20 // 右边距（用于站点）
    const ST_WIDTH = 30 // 每个站点固定宽度
    
    // 计算可用宽度
    const AVAILABLE_WIDTH = computed(() => {
      return SCREEN_WIDTH - PADDING * 2 - PADDING_LEFT - PADDING_RIGHT
    })

    // 根据站点数量动态计算站间距
    const stationGap = computed(() => {
      const totalStations = stations.value.length
      if (totalStations <= 1) return 0
      
      // 计算所有站点占用的总宽度
      const totalStationsWidth = totalStations * ST_WIDTH
      
      // 计算剩余空间
      const remainingSpace = AVAILABLE_WIDTH.value - totalStationsWidth
      
      // 如果有剩余空间，平均分配到站点之间的间距
      if (remainingSpace > 0) {
        return remainingSpace / (totalStations - 1)
      }
      
      // 如果空间不足，返回0（站点会重叠，但至少能显示）
      return 0
    })

    // 计算每个站点的水平位置（根据站点数量动态分布）
    const getStationPosition = (index) => {
      const totalStations = stations.value.length
      if (totalStations === 0) return PADDING_LEFT
      if (totalStations === 1) return PADDING_LEFT + (AVAILABLE_WIDTH.value - ST_WIDTH) / 2
      
      // 计算每个站点之间的间距
      const gap = stationGap.value
      
      // 计算位置：左边距 + 索引 * (站点宽度 + 间距)
      return PADDING_LEFT + index * (ST_WIDTH + gap)
    }

    // 计算右边边缘位置（半圆连接在右边屏幕边缘）
    const rightEdgePosition = computed(() => {
      return SCREEN_WIDTH - PADDING - PADDING_RIGHT
    })

    // 使用显示器1的环线实现方式
    // 计算半圆的半径和位置（参考显示器1的cornerR和trackGap）
    const trackGap = 35 // 上排到下排的距离（与 .track-lines 的高度一致）
    const cornerR = 5 // 半圆半径（间隙约5像素）
    const semicircleRadius = computed(() => {
      return cornerR
    })
    
    // 计算半圆路径的关键点（参考显示器1的路径计算方式）
    const semicirclePath = computed(() => {
      // 注意：track-lines 内部坐标系是从左边 padding 开始算起，
      // 为了让半胶囊尽量贴近最右侧，这里在直线的右端基础上再向右偏移 10px
      const x2 = rightEdgePosition.value - PADDING_LEFT + 10

      // 直线高度为 4px，中心分别在 2px 和 trackGap - 2px
      const lineHeight = 4
      const lineCenterOffset = lineHeight / 2 // 2px
      const yTop = lineCenterOffset                  // 上侧直线中心：2
      const yBottom = trackGap - lineCenterOffset    // 下侧直线中心：35 - 2 = 33
      const r = cornerR
      
      // 从上侧直线中心 (x2, yTop) 出发，绘制右侧半胶囊，到下侧直线中心 (x2, yBottom)
      return `M ${x2} ${yTop} L ${x2 - 10} ${yTop} A ${r} ${r} 0 0 1 ${x2 - 10 + r} ${yTop + r} L ${x2 - 10 + r} ${yBottom - r} A ${r} ${r} 0 0 1 ${x2 - 10} ${yBottom} L ${x2} ${yBottom}`
    })

    // 获取站点状态类
    function getStationClass(index) {
      if (index < activeStationIdx.value) {
        return 'passed' // 已过站：红色
      } else {
        return 'future' // 未过站：黑色（包括当前站）
      }
    }

    // 判断是否为当前站点
    function isCurrentStation(index) {
      return index === activeStationIdx.value
    }

    // 判断站点是否已过站
    function isPassed(index) {
      return index < activeStationIdx.value
    }

    // 所有站点，前半部分在上排，后半部分在下排
    // 上排从左到右覆盖整个屏幕，下排从右到左覆盖整个屏幕
    const allStationsWithRow = computed(() => {
      const totalStations = stations.value.length
      const midPoint = Math.ceil(totalStations / 2) // 上排站点数量
      
      return stations.value.map((station, index) => {
        return {
          ...station,
          index,
          isPassed: isPassed(index),
          isCurrent: isCurrentStation(index),
          // 前半部分站点在上排，后半部分站点在下排
          isTopRow: index < midPoint
        }
      })
    })
    
    // 计算上排站点的位置（从左到右，覆盖整个屏幕宽度）
    const getTopStationPosition = (index) => {
      const totalStations = stations.value.length
      const midPoint = Math.ceil(totalStations / 2)
      
      if (index >= midPoint) return 0 // 下排站点，不在上排显示
      if (totalStations === 0) return PADDING_LEFT
      if (midPoint === 1) return PADDING_LEFT + (rightEdgePosition.value - PADDING_LEFT - ST_WIDTH) / 2
      
      // 上排站点从左到右，均匀分布在整个屏幕宽度上
      const gap = (rightEdgePosition.value - PADDING_LEFT - midPoint * ST_WIDTH) / (midPoint - 1)
      return PADDING_LEFT + index * (ST_WIDTH + gap)
    }
    
    // 计算下排站点的位置（从左到右，与上排对齐）
    const getBottomStationPosition = (index) => {
      const totalStations = stations.value.length
      const midPoint = Math.ceil(totalStations / 2)
      
      if (index < midPoint) return 0 // 上排站点，不在下排显示
      if (totalStations === 0) return PADDING_LEFT
      
      // 下排站点索引范围：midPoint 到 totalStations-1
      const bottomCount = totalStations - midPoint
      const bottomIndex = index - midPoint // 下排中的相对索引（0到bottomCount-1）
      
      if (bottomCount === 1) {
        // 只有一个下排站点，居中显示
        return PADDING_LEFT + (rightEdgePosition.value - PADDING_LEFT - ST_WIDTH) / 2
      }
      
      // 计算间距，均匀分布在整个屏幕宽度上（与上排使用相同的计算方式）
      const gap = (rightEdgePosition.value - PADDING_LEFT - bottomCount * ST_WIDTH) / (bottomCount - 1)
      
      // 如果是偶数个站点，让下排站点与上排站点垂直对齐
      // 下排站点从左到右按顺序排列（不反转）
      return PADDING_LEFT + bottomIndex * (ST_WIDTH + gap)
    }

    // 屏幕适配
    function fitScreen() {
      const ratio = Math.min(window.innerWidth / 1500, window.innerHeight / 400)
      scaleRatio.value = ratio
    }

    // 处理广播消息
    function handleBroadcastMessage(event) {
      const data = event.data
      if (!data) return
      
      if (data.t === 'SYNC') {
        appData.value = data.d
        if (data.r) {
          rt.value = { ...data.r }
        }
      } else if (data.type === 'update_all') {
        appData.value = data.data
        if (data.rt) {
          rt.value = { ...data.rt }
        }
      } else if (data.type === 'control') {
        handleControl(data.cmd)
      }
    }

    // 处理控制命令
    function handleControl(cmd) {
      if (!appData.value || stations.value.length === 0) return
      
      if (cmd === 'next') {
        if (rt.value.state === 0) {
          rt.value.state = 1
        } else {
          rt.value.state = 0
          if (rt.value.idx < stations.value.length - 1) {
            rt.value.idx++
          } else {
            rt.value.idx = 0
          }
        }
      } else if (cmd === 'prev') {
        rt.value.state = 0
        if (rt.value.idx > 0) {
          rt.value.idx--
        }
      }
    }

    // 键盘事件处理
    function handleKeyDown(e) {
      const targetTag = e.target && e.target.tagName
      if (targetTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return
      
      if (e.code === 'Space' || e.code === 'Enter') e.preventDefault()
      
      const ignore = new Set([
        'ShiftLeft', 'ShiftRight', 
        'ControlLeft', 'ControlRight', 
        'AltLeft', 'AltRight', 
        'MetaLeft', 'MetaRight',
        'CapsLock', 'NumLock', 'ScrollLock', 'ContextMenu'
      ])
      if (ignore.has(e.code)) return
      
      try {
        const normCode = e.code || e.key
        const normKey = e.key || e.code || null
        
        if (bc) {
          bc.postMessage({ t: 'CMD_KEY', code: e.code, key: e.key, normCode, normKey })
        }
        if (bcNew) {
          bcNew.postMessage({ t: 'CMD_KEY', code: e.code, key: e.key, normCode, normKey })
        }
      } catch (err) {
        console.warn('Keyboard event error', err)
      }
    }

    // ============ 生命周期 ============
    onMounted(() => {
      if (window.electronAPI && window.electronAPI.platform) {
        platform.value = window.electronAPI.platform
      }
      
      // 初始化 BroadcastChannel
      try {
        bc = new BroadcastChannel('metro_pids_channel')
        bc.onmessage = handleBroadcastMessage
        bc.postMessage({ type: 'REQ' })
      } catch (e) {
        console.warn('BroadcastChannel (metro_pids_channel) not supported', e)
      }
      
      try {
        bcNew = new BroadcastChannel('metro_pids_v3')
        bcNew.onmessage = handleBroadcastMessage
        bcNew.postMessage({ t: 'REQ' })
      } catch (e) {
        console.warn('BroadcastChannel (metro_pids_v3) not supported', e)
      }
      
      fitScreen()
      console.log('[Display-2] 屏幕适配完成，缩放比例:', scaleRatio.value)
      window.addEventListener('resize', () => {
        fitScreen()
        console.log('[Display-2] 窗口大小变化，新尺寸:', window.innerWidth, 'x', window.innerHeight, '缩放比例:', scaleRatio.value)
      })
      document.addEventListener('keydown', handleKeyDown)
    })

    onBeforeUnmount(() => {
      if (bc) {
        bc.close()
        bc = null
      }
      if (bcNew) {
        bcNew.close()
        bcNew = null
      }
      window.removeEventListener('resize', fitScreen)
      document.removeEventListener('keydown', handleKeyDown)
    })

    return {
      appData,
      rt,
      scaleRatio,
      platform,
      isDarwin,
      isLinux,
      stations,
      lineNumber,
      routeNumber,
      routeDirection,
      lineNameHTML,
      activeStationIdx,
      ST_WIDTH,
      stationGap,
      getStationPosition,
      getTopStationPosition,
      getBottomStationPosition,
      allStationsWithRow,
      getStationClass,
      isCurrentStation,
      rightEdgePosition,
      semicircleRadius,
      semicirclePath,
      SCREEN_WIDTH,
      PADDING,
      PADDING_RIGHT,
      PADDING_LEFT
    }
  },
  template: `
    <div id="display-app">
      <div id="scaler" :style="{ transform: 'scale(' + scaleRatio + ')' }">
        <!-- Custom Title Bar -->
        <div id="display-titlebar" class="custom-titlebar" :class="{ darwin: isDarwin, linux: isLinux }">
          <div style="
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 8px;
          ">
            <i class="fas fa-subway" style="
              color: #fff;
              font-size: 14px;
            "></i>
            <span style="
              font-size: 13px;
              font-weight: 600;
              color: #fff;
              white-space: nowrap;
            ">Metro PIDS - Display 2</span>
          </div>
        </div>
        
        <!-- Header: 深蓝色背景，显示路线信息和图例 -->
        <div class="header">
          <div class="header-left">
            <span class="header-route" v-html="lineNameHTML"></span>
            <span class="header-direction">{{ routeDirection }}</span>
          </div>
          
          <div class="legend">
            <div class="legend-item">
              <div class="legend-dot passed"></div>
              <span class="legend-text">已过站</span>
            </div>
            <div class="legend-item">
              <div class="legend-dot future"></div>
              <span class="legend-text">未过站</span>
            </div>
          </div>
        </div>

        <!-- 线路区域 -->
        <div class="route-map">
          <!-- 上排站点 - 前半部分站点从左到右排列（覆盖整个屏幕宽度） -->
          <div class="station-row row-top">
            <div 
              v-for="station in allStationsWithRow" 
              :key="'top-' + station.index"
              v-show="station.isTopRow"
              class="station"
              :class="{ 'passed': station.isPassed, 'future': !station.isPassed }"
              :style="{ left: getTopStationPosition(station.index) + 'px' }"
            >
              <span class="station-name">{{ station.name }}</span>
              <div class="station-dot" :class="{ 'passed': station.isPassed, 'future': !station.isPassed }"></div>
              <div v-if="station.isCurrent" class="current-indicator"></div>
            </div>
          </div>

          <!-- 轨道线条 - 半胶囊形状（半圆在右边边缘） -->
          <div class="track-lines">
            <!-- 上排路线：从左到右边边缘 -->
            <div 
              class="track-line-top" 
              :style="{ 
                width: (rightEdgePosition - PADDING_LEFT) + 'px' 
              }"
            ></div>
            
            <!-- 右边半圆连接（使用显示器1的环线实现方式） -->
            <svg 
              class="track-semicircle-svg"
              :style="{ 
                position: 'absolute',
                left: '0',
                top: '0',
                width: '100%',
                height: '100%',
                overflow: 'visible',
                zIndex: '1'
              }"
            >
              <!-- 使用显示器1的路径绘制方式 -->
              <path 
                :d="semicirclePath"
                stroke="#a5f3bc"
                stroke-width="4"
                fill="none"
                stroke-linecap="round"
              />
            </svg>
            
            <!-- 下排路线：从右边边缘向左延伸 -->
            <div 
              class="track-line-bottom" 
              :style="{ 
                left: PADDING_LEFT + 'px',
                width: (rightEdgePosition - PADDING_LEFT) + 'px'
              }"
            >
              <div class="arrow-left-bottom"></div>
            </div>
          </div>

          <!-- 下排站点 - 后半部分站点从右到左排列（覆盖整个屏幕宽度） -->
          <div class="station-row row-bottom">
            <div 
              v-for="station in allStationsWithRow" 
              :key="'bottom-' + station.index"
              v-show="!station.isTopRow"
              class="station"
              :class="{ 'passed': station.isPassed, 'future': !station.isPassed }"
              :style="{ left: getBottomStationPosition(station.index) + 'px' }"
            >
              <div class="station-dot" :class="{ 'passed': station.isPassed, 'future': !station.isPassed }"></div>
              <div v-if="station.isCurrent" class="current-indicator"></div>
              <span class="station-name">{{ station.name }}</span>
            </div>
          </div>
        </div>

        <!-- Footer: 深蓝色底栏 -->
        <div class="footer">
        </div>
      </div>
    </div>
  `
}
