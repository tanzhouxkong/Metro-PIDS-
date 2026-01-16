import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import {
  getFilteredStations,
  calculateDisplayStationInfo
} from '../../src/utils/displayStationCalculator.js'

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
    
    // "下一站"页面显示控制
    const forceShowNextStationPage = ref(false) // 强制显示"下一站"页面（用于定时器控制）
    let nextStationTimer = null // 定时器
    
    // "到站"页面显示控制
    const forceShowArrivalPage = ref(false) // 强制显示"到站"页面（用于定时器控制）
    let arrivalTimer = null // 定时器
    
    // 下一站圆点闪烁控制
    const isNextStationBlinking = ref(false) // 是否正在闪烁
    const blinkColor = ref('red') // 当前闪烁颜色：'red' 或 'green'
    let blinkTimer = null // 闪烁定时器
    
    // 底栏LED文字和水印
    const footerLED = ref('') // LED滚动文字
    const footerWatermark = ref(true) // 是否显示水印

    // BroadcastChannel
    let bc = null
    let bcNew = null

    // ============ 计算属性 ============
    // 获取所有站点（未过滤）
    const allStations = computed(() => {
      return appData.value?.stations || []
    })
    
    // 获取当前线路方向
    const currentDirection = computed(() => {
      return appData.value?.meta?.dirType || null
    })
    
    // 显示器2配置：方向过滤 + 下行反转
    const display2Config = {
      filterByDirection: true,
      reverseOnDown: true
    }
    
    // 使用站点计算 API 获取过滤后的站点数组
    // 返回过滤后的站点数组，每个站点包含原始索引
    // 下行方向时自动反转站点顺序，使首末站位置对调
    const stations = computed(() => {
      if (!appData.value) return []
      
      const dirType = currentDirection.value
      return getFilteredStations(appData.value, dirType, display2Config)
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

    // 使用站点计算 API 计算当前站和下一站信息
    const stationInfo = computed(() => {
      if (!appData.value || stations.value.length === 0) {
        return { currentIdx: 0, nextIdx: -1, nextStationName: '' }
      }
      
      // 优先使用主程序发送的索引（如果可用）
      if (typeof rt.value.display2CurrentIdx === 'number' && rt.value.display2CurrentIdx >= 0) {
        const currentIdx = Math.min(rt.value.display2CurrentIdx, stations.value.length - 1)
        let nextIdx = -1
        let nextStationName = ''
        
        // 如果主程序也发送了下一站信息，使用它
        if (rt.value.state === 1) {
          if (typeof rt.value.display2NextIdx === 'number' && rt.value.display2NextIdx >= 0) {
            nextIdx = Math.min(rt.value.display2NextIdx, stations.value.length - 1)
          }
          if (rt.value.nextStationName) {
            nextStationName = rt.value.nextStationName
          }
        }
        
        return { currentIdx, nextIdx, nextStationName }
      }
      
      // 否则使用 API 计算
      const rtState = {
        idx: rt.value.idx,
        state: rt.value.state
      }
      return calculateDisplayStationInfo(appData.value, rtState, display2Config)
    })
    
    // 当前活动站点索引（在过滤后的站点数组中的索引）
    const activeStationIdx = computed(() => {
      if (stations.value.length === 0) return 0
      const idx = stationInfo.value.currentIdx
      return idx >= 0 ? Math.min(idx, stations.value.length - 1) : 0
    })
    
    // 获取原始站点索引（用于判断站点状态）
    const getOriginalIndex = (filteredIndex) => {
      if (filteredIndex >= 0 && filteredIndex < stations.value.length) {
        return stations.value[filteredIndex].originalIndex
      }
      return filteredIndex
    }

    // 是否显示"下一站"页面：仅在强制显示时显示（由定时器控制）
    const showNextStationPage = computed(() => {
      return forceShowNextStationPage.value && stations.value.length > 0
    })
    
    // 是否显示"到站"页面：仅在强制显示时显示（由定时器控制）
    const showArrivalPage = computed(() => {
      return forceShowArrivalPage.value && stations.value.length > 0
    })
    
    // "下一站"页面显示时长（毫秒），默认10秒，可从设置中读取
    const nextStationDuration = ref(10000)
    
    // "到站"页面显示时长（毫秒），默认10秒，复用 nextStationDuration
    const arrivalDuration = computed(() => nextStationDuration.value)
    
    // 当前站名称：用于"到站"页面显示
    const currentStationName = computed(() => {
      if (stations.value.length === 0 || activeStationIdx.value < 0) return ''
      const currentStation = stations.value[activeStationIdx.value]
      return currentStation?.name || ''
    })

    // 下一站名称：使用站点计算 API 的结果
    const nextStationName = computed(() => {
      if (rt.value.state !== 1) return ''
      // 优先使用主程序发送的下一站名称
      if (rt.value.nextStationName) {
        return rt.value.nextStationName
      }
      // 否则使用 API 计算的结果
      return stationInfo.value.nextStationName || ''
    })
    
    // 下一站索引（在过滤后的站点数组中的索引）
    const nextStationIdx = computed(() => {
      if (stations.value.length === 0) return -1
      if (rt.value.state !== 1) return -1
      
      // 优先使用主程序发送的索引
      if (typeof rt.value.display2NextIdx === 'number' && rt.value.display2NextIdx >= 0) {
        return Math.min(rt.value.display2NextIdx, stations.value.length - 1)
      }
      
      // 如果没有，尝试使用主程序发送的下一站名称查找
      const nameFromMain = rt.value.nextStationName
      if (nameFromMain) {
        const idx = stations.value.findIndex(st => st.name === nameFromMain)
        if (idx >= 0) return idx
      }
      
      // 否则使用 API 计算的结果
      const idx = stationInfo.value.nextIdx
      return idx >= 0 ? Math.min(idx, stations.value.length - 1) : -1
    })
    
    // 判断站点是否为下一站且正在闪烁
    function isStationBlinking(index) {
      return isNextStationBlinking.value && index === nextStationIdx.value
    }
    
    // 获取站点圆点的闪烁类名
    function getStationDotClass(index) {
      // 如果正在闪烁（出站状态下的下一站）
      if (isStationBlinking(index)) {
        return blinkColor.value === 'red' ? 'passed' : 'future'
      }
      // 如果进站状态且是当前站，圆点显示为红色常亮
      if (rt.value.state === 0 && index === activeStationIdx.value) {
        return 'passed' // 进站时当前站：红色常亮
      }
      // 已过站：红色（包括出站状态下的当前站，因为出站后当前站已经是已过站）
      if (index < activeStationIdx.value || (rt.value.state === 1 && index === activeStationIdx.value)) {
        return 'passed'
      }
      // 未过站：绿色
      return 'future'
    }
    
    // 启动下一站圆点闪烁
    function startNextStationBlink() {
      // 清除之前的闪烁定时器
      if (blinkTimer) {
        clearInterval(blinkTimer)
        blinkTimer = null
      }
      
      // 如果不在出站状态，不启动闪烁
      if (rt.value.state !== 1 || nextStationIdx.value === -1) {
        isNextStationBlinking.value = false
        return
      }
      
      // 启动闪烁
      isNextStationBlinking.value = true
      blinkColor.value = 'red' // 从红色开始
      
      // 每500毫秒切换一次颜色
      blinkTimer = setInterval(() => {
        blinkColor.value = blinkColor.value === 'red' ? 'green' : 'red'
      }, 500)
    }
    
    // 停止下一站圆点闪烁
    function stopNextStationBlink() {
      if (blinkTimer) {
        clearInterval(blinkTimer)
        blinkTimer = null
      }
      isNextStationBlinking.value = false
    }

    // 地图相关计算
    const SCREEN_WIDTH = 1500 // 屏幕宽度
    const PADDING = 40 // 左右内边距
    const PADDING_LEFT = 5 // 左边距（用于站点）
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
    
    // 计算半圆路径的关键点（绘制真正的半圆，向右凸出）
    const semicirclePath = computed(() => {
      // 注意：track-lines 内部坐标系是从左边 padding 开始算起，
      // 上排和下排直线的右端位置
      const lineRightEnd = rightEdgePosition.value - PADDING_LEFT
      // 让半圆向左移动，减少向右的偏移量（从40px减少到10px）
      const x2 = rightEdgePosition.value - PADDING_LEFT + 30

      // 直线高度为 4px，中心分别在 2px 和 trackGap - 2px
      const lineHeight = 4
      const lineCenterOffset = lineHeight / 2 // 2px
      const yTop = lineCenterOffset                  // 上侧直线中心：2
      const yBottom = trackGap - lineCenterOffset    // 下侧直线中心：35 - 2 = 33
      
      // 计算半圆的半径（从上侧直线中心到下侧直线中心的距离的一半）
      const semicircleRadius = (yBottom - yTop) / 2  // (33 - 2) / 2 = 15.5
      const yCenter = (yTop + yBottom) / 2          // 半圆中心y坐标：17.5
      const xRight = x2 + semicircleRadius           // 半圆最右侧x坐标
      
      // 绘制路径：从上排直线右端 -> 连接线 -> 半圆 -> 连接线 -> 下排直线右端
      // 1. 从上排直线右端到半圆起点（连接线）
      // 2. 绘制半圆
      // 3. 从半圆终点到下排直线右端（连接线）
      // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
      // large-arc-flag = 0 (90度不是大弧)
      // sweep-flag = 1 (顺时针方向)
      return `M ${lineRightEnd} ${yTop} L ${x2} ${yTop} A ${semicircleRadius} ${semicircleRadius} 0 0 1 ${xRight} ${yCenter} A ${semicircleRadius} ${semicircleRadius} 0 0 1 ${x2} ${yBottom} L ${lineRightEnd} ${yBottom}`
    })

    // 获取站点状态类（使用过滤后的索引）
    function getStationClass(index) {
      if (index < activeStationIdx.value) {
        return 'passed' // 已过站：红色
      } else {
        return 'future' // 未过站：黑色（包括当前站）
      }
    }

    // 判断是否为当前站点（使用过滤后的索引）
    function isCurrentStation(index) {
      return index === activeStationIdx.value
    }

    // 判断站点是否已过站（使用过滤后的索引）
    function isPassed(index) {
      return index < activeStationIdx.value
    }

    // 处理站名：根据图片中的逻辑
    // - 单列模式：2-6个字符，垂直均匀分布
    // - 两列换行模式：超过6个字符（≥7个字符）时，第一列固定4个字符，第二列剩余字符，优先在"街"或"路"处换行
    // 注意：此函数对所有站点都适用，包括仅在上行或下行停靠的站点
    function formatStationName(name, station = null) {
      if (!name || typeof name !== 'string') return ''
      
      // 将站名拆分成字符数组
      const chars = Array.from(name)
      
      // 对于仅在上行或下行停靠的站点，站名格式化逻辑与普通站点相同
      // 这些站点在显示时已经被过滤（通过 getFilteredStations），
      // 但站名格式化逻辑本身不需要考虑 dock 属性
      
      // 辅助函数：格式化字符数组为HTML（单列模式）
      const formatCharsSingle = (charArray) => {
        return charArray.map(char => {
          const escapedChar = char
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
          return `<span class="station-name-char">${escapedChar}</span>`
        }).join('')
      }
      
      // 辅助函数：格式化字符数组为HTML（两列模式，每列单独包装）
      const formatCharsColumn = (charArray) => {
        return charArray.map(char => {
          const escapedChar = char
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
          return `<span class="station-name-char">${escapedChar}</span>`
        }).join('')
      }
      
      // 如果站名不超过6个字，单列模式：垂直均匀分布
      if (chars.length <= 6) {
        return formatCharsSingle(chars)
      }
      
      // 如果站名超过7个字，需要换行分成两栏
      // 第一列固定4个字符，第二列剩余字符
      const breakChars = ['街', '路']
      let breakIndex = -1
      
      // 优先在"街"或"路"处换行（检查所有字符，从后往前找）
      // 第一列固定4个字符，所以检查位置4及之后是否有"街"或"路"
      // 如果找到"街"或"路"，第一列仍然是4个字符，第二列从位置4开始
      for (let i = chars.length - 1; i >= 4; i--) {
        if (breakChars.includes(chars[i])) {
          // 找到"街"或"路"，但第一列固定为4个字符
          // 所以无论"街"或"路"在哪里，都从位置4分割
          breakIndex = 4
          break
        }
      }
      
      // 如果找到了"街"或"路"，使用4+剩余字符的分割方式
      if (breakIndex > 0) {
        // 第一部分：第一列固定4个字符
        const part1 = chars.slice(0, 4)
        // 第二部分：从位置4开始的所有剩余字符
        const part2 = chars.slice(4)
        
        // 如果两部分都有内容，用两列容器包装
        if (part1.length > 0 && part2.length > 0) {
          return `<span class="station-name-col station-name-col-1">${formatCharsColumn(part1)}</span><span class="station-name-col station-name-col-2">${formatCharsColumn(part2)}</span>`
        } else if (part1.length > 0) {
          return `<span class="station-name-col station-name-col-1">${formatCharsColumn(part1)}</span>`
        } else {
          return `<span class="station-name-col station-name-col-2">${formatCharsColumn(part2)}</span>`
        }
      }
      
      // 如果没有找到"街"或"路"，或者位置不合适，第一列固定4个字符，第二列剩余字符
      const part1 = chars.slice(0, 4)
      const part2 = chars.slice(4)
      
      if (part2.length > 0) {
        return `<span class="station-name-col station-name-col-1">${formatCharsColumn(part1)}</span><span class="station-name-col station-name-col-2">${formatCharsColumn(part2)}</span>`
      } else {
        return `<span class="station-name-col station-name-col-1">${formatCharsColumn(part1)}</span>`
      }
    }

    // 所有站点，前半部分在上排，后半部分在下排
    // 上排从左到右覆盖整个屏幕，下排从右到左覆盖整个屏幕
    const allStationsWithRow = computed(() => {
      const totalStations = stations.value.length
      const midPoint = Math.ceil(totalStations / 2) // 上排站点数量
      
      return stations.value.map((station, filteredIndex) => {
        // 对所有站点（包括仅在上行或下行停靠的站点）都进行站名格式化
        // 这些站点在显示时已经被过滤（通过 getFilteredStations），
        // 但站名格式化逻辑对所有可见站点都适用
        const formatted = formatStationName(station.name, station)
        const isTwoColumn = formatted.includes('station-name-col')
        
        return {
          ...station,
          index: filteredIndex, // 使用过滤后的索引
          originalIndex: station.originalIndex, // 保留原始索引
          isPassed: isPassed(filteredIndex),
          isCurrent: isCurrentStation(filteredIndex),
          // 前半部分站点在上排，后半部分站点在下排
          isTopRow: filteredIndex < midPoint,
          // 处理后的站名（支持换行）
          formattedName: formatted,
          // 是否为两列模式
          isTwoColumn: isTwoColumn,
          // 是否为下一站（出站信号时，下一站站名显示为红色）
          // 或是否为当前站（进站信号时，当前站站名显示为红色）
          isNextStation: (rt.value.state === 1 && filteredIndex === nextStationIdx.value) ||
                        (rt.value.state === 0 && filteredIndex === activeStationIdx.value)
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
      // 第一个站点（index === 0）使用更小的左边距，减少空白
      const firstStationPadding = index === 0 ? 0 : PADDING_LEFT
      return firstStationPadding + index * (ST_WIDTH + gap)
    }
    
    // 计算下排站点的位置（从右到左排列，终点站在左边第一个）
    const getBottomStationPosition = (index) => {
      const totalStations = stations.value.length
      const midPoint = Math.ceil(totalStations / 2)
      
      if (index < midPoint) return 0 // 上排站点，不在下排显示
      if (totalStations === 0) return PADDING_LEFT
      
      // 下排站点索引范围：midPoint 到 totalStations-1
      const bottomCount = totalStations - midPoint
      const bottomIndex = index - midPoint // 下排中的相对索引（0到bottomCount-1）
      
      if (bottomCount === 1) {
        // 只有一个下排站点（终点站），显示在左边第一个位置，使用更小的左边距
        return 0
      }
      
      // 计算间距，均匀分布在整个屏幕宽度上
      const gap = (rightEdgePosition.value - PADDING_LEFT - bottomCount * ST_WIDTH) / (bottomCount - 1)
      
      // 下排站点从右到左排列，终点站（最后一个站点）在左边第一个位置
      // 反转顺序：最后一个站点（bottomIndex = bottomCount - 1）应该在左边第一个位置
      const reversedIndex = bottomCount - 1 - bottomIndex
      // 第一个站点（reversedIndex === 0）使用更小的左边距，减少空白
      const firstStationPadding = reversedIndex === 0 ? 0 : PADDING_LEFT
      return firstStationPadding + reversedIndex * (ST_WIDTH + gap)
    }

    // 屏幕适配（窗口打开时检测分辨率和缩放）
    function fitScreen() {
      // 检测分辨率和缩放信息（类似显示器1的逻辑）
      const logicalWidth = window.screen.width || window.innerWidth
      const logicalHeight = window.screen.height || window.innerHeight
      const scaleFactor = window.devicePixelRatio || 1.0
      const physicalWidth = Math.round(logicalWidth * scaleFactor)
      const physicalHeight = Math.round(logicalHeight * scaleFactor)
      
      // 检测是否为4K或2K分辨率
      const is4KResolution = physicalWidth >= 3800 && physicalWidth <= 3900 && 
                             physicalHeight >= 2100 && physicalHeight <= 2200
      const is2KResolution = physicalWidth >= 2500 && physicalWidth <= 2600 && 
                             physicalHeight >= 1400 && physicalHeight <= 1500
      
      // 根据分辨率和缩放调整适配策略
      // 统一使用1.0的baseScale，确保内容完全填充窗口，避免白边
      let baseScale = 1.0
      
      // 计算基础缩放比例
      // 使用 Math.min 确保内容不超出窗口，但配合 baseScale 调整避免白边
      const widthRatio = window.innerWidth / 1500
      const heightRatio = window.innerHeight / 400
      let ratio = Math.min(widthRatio, heightRatio) * baseScale
      
      // 对所有情况都稍微增加缩放比例（1%），确保内容能够完全覆盖窗口，避免白边
      // 这样可以确保在不同分辨率和缩放比例下都能完全填充窗口
      ratio = ratio * 1.01
      
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
        // 如果包含设置信息，更新"下一站"页面显示时长、LED文字和水印
        if (data.settings && data.settings.display) {
          if (data.settings.display.display2NextStationDuration !== undefined) {
            nextStationDuration.value = data.settings.display.display2NextStationDuration
          }
          if (data.settings.display.display2FooterLED !== undefined) {
            footerLED.value = data.settings.display.display2FooterLED || ''
          }
          if (data.settings.display.display2FooterWatermark !== undefined) {
            footerWatermark.value = data.settings.display.display2FooterWatermark !== false
          }
        }
      } else if (data.type === 'update_all') {
        appData.value = data.data
        if (data.rt) {
          rt.value = { ...data.rt }
        }
        // 如果包含设置信息，更新"下一站"页面显示时长、LED文字和水印
        if (data.settings && data.settings.display) {
          if (data.settings.display.display2NextStationDuration !== undefined) {
            nextStationDuration.value = data.settings.display.display2NextStationDuration
          }
          if (data.settings.display.display2FooterLED !== undefined) {
            footerLED.value = data.settings.display.display2FooterLED || ''
          }
          if (data.settings.display.display2FooterWatermark !== undefined) {
            footerWatermark.value = data.settings.display.display2FooterWatermark !== false
          }
        }
      } else if (data.type === 'control') {
        handleControl(data.cmd)
      } else if (data.type === 'settings') {
        // 接收设置更新
        if (data.settings && data.settings.display) {
          if (data.settings.display.display2NextStationDuration !== undefined) {
            nextStationDuration.value = data.settings.display.display2NextStationDuration
          }
          if (data.settings.display.display2FooterLED !== undefined) {
            footerLED.value = data.settings.display.display2FooterLED || ''
          }
          if (data.settings.display.display2FooterWatermark !== undefined) {
            footerWatermark.value = data.settings.display.display2FooterWatermark !== false
          }
        }
      }
    }
    
    // 处理"下一站"页面显示逻辑
    function handleNextStationPageDisplay() {
      // 清除之前的定时器
      if (nextStationTimer) {
        clearTimeout(nextStationTimer)
        nextStationTimer = null
      }
      
      // 如果收到出站信号（state === 1），启动定时器
      if (rt.value.state === 1 && stations.value.length > 0) {
        forceShowNextStationPage.value = true
        
        // 启动定时器，在指定时间后切回线路图并启动闪烁
        nextStationTimer = setTimeout(() => {
          forceShowNextStationPage.value = false
          nextStationTimer = null
          // "下一站"页面结束后，启动下一站圆点闪烁
          startNextStationBlink()
        }, nextStationDuration.value)
      } else {
        // 如果状态不是出站，立即隐藏"下一站"页面并停止闪烁
        forceShowNextStationPage.value = false
        stopNextStationBlink()
      }
    }
    
    // 处理"到站"页面显示逻辑
    function handleArrivalPageDisplay() {
      // 清除之前的定时器
      if (arrivalTimer) {
        clearTimeout(arrivalTimer)
        arrivalTimer = null
      }
      
      // 如果收到进站信号（state === 0），启动定时器
      if (rt.value.state === 0 && stations.value.length > 0) {
        forceShowArrivalPage.value = true
        
        // 启动定时器，在指定时间后切回线路图
        arrivalTimer = setTimeout(() => {
          forceShowArrivalPage.value = false
          arrivalTimer = null
        }, arrivalDuration.value)
      } else {
        // 如果状态不是进站，立即隐藏"到站"页面
        forceShowArrivalPage.value = false
      }
    }
    
    // 监听 rt.state 的变化
    watch(() => rt.value.state, (newState, oldState) => {
      handleNextStationPageDisplay()
      handleArrivalPageDisplay()
      // 如果状态改变，停止闪烁
      if (newState !== 1) {
        stopNextStationBlink()
      }
    })

    // 更新LED滚动效果
    function updateLEDScroll() {
      nextTick(() => {
        const ledContent = document.querySelector('.footer-led-content')
        if (!ledContent) return
        
        const ledContainer = document.querySelector('.footer-led')
        if (!ledContainer) return
        
        // 移除之前的滚动类
        ledContent.classList.remove('scrolling')
        
        // 检查是否需要滚动
        if (ledContent.scrollWidth > ledContainer.offsetWidth) {
          // 复制内容以实现无缝滚动
          const originalHTML = ledContent.innerHTML
          ledContent.innerHTML = `${originalHTML}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${originalHTML}`
          ledContent.classList.add('scrolling')
          
          // 根据内容宽度计算滚动时间
          const contentWidth = ledContent.scrollWidth / 2 // 因为内容被复制了
          const scrollSpeed = 50 // 像素/秒
          const duration = (contentWidth + 50) / scrollSpeed
          ledContent.style.animationDuration = `${Math.max(10, Math.min(30, duration))}s`
        } else {
          // 恢复原始内容
          const textOnly = footerLED.value.replace(/<[^>]+>([^<]*)<\/>/g, '$1')
          ledContent.innerHTML = parseColorMarkup(footerLED.value)
        }
      })
    }
    
    // 监听LED文字变化
    watch(footerLED, () => {
      updateLEDScroll()
    })
    
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
      
      // 监听 window.postMessage（用于接收主程序发送的数据）
      window.addEventListener('message', (event) => {
        if (event.data && event.data.t === 'SYNC') {
          handleBroadcastMessage({ data: event.data })
        }
      })
      
      fitScreen()
      
      // 初始化时检查是否需要显示"下一站"或"到站"页面
      handleNextStationPageDisplay()
      handleArrivalPageDisplay()
      console.log('[Display-2] 屏幕适配完成，缩放比例:', scaleRatio.value)
      window.addEventListener('resize', () => {
        fitScreen()
        updateLEDScroll() // 窗口大小变化时重新检测LED滚动
        console.log('[Display-2] 窗口大小变化，新尺寸:', window.innerWidth, 'x', window.innerHeight, '缩放比例:', scaleRatio.value)
      })
      document.addEventListener('keydown', handleKeyDown)
    })

    onBeforeUnmount(() => {
      // 清除定时器
      if (nextStationTimer) {
        clearTimeout(nextStationTimer)
        nextStationTimer = null
      }
      
      if (arrivalTimer) {
        clearTimeout(arrivalTimer)
        arrivalTimer = null
      }
      
      // 清除闪烁定时器
      stopNextStationBlink()
      
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
      showNextStationPage,
      nextStationName,
      showArrivalPage,
      currentStationName,
      ST_WIDTH,
      stationGap,
      getStationPosition,
      getTopStationPosition,
      getBottomStationPosition,
      allStationsWithRow,
      getStationClass,
      isCurrentStation,
      getStationDotClass,
      nextStationIdx,
      rightEdgePosition,
      semicircleRadius,
      semicirclePath,
      SCREEN_WIDTH,
      PADDING,
      PADDING_RIGHT,
      PADDING_LEFT,
      footerLED,
      footerWatermark,
      parseColorMarkup
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

        <!-- 下一站页面：全屏白色，仅在出站信号时显示 -->
        <div v-if="showNextStationPage" class="next-station-page">
          <div class="next-station-content">
            <span class="next-station-label">下一站：</span>
            <span class="next-station-name">{{ nextStationName }}</span>
          </div>
        </div>

        <!-- 到站页面：全屏白色，仅在进站信号时显示 -->
        <div v-else-if="showArrivalPage" class="next-station-page arrival-page">
          <div class="next-station-content" style="flex-direction: column; align-items: center;">
            <div>
              <span class="next-station-label">到站：</span>
              <span class="next-station-name">{{ currentStationName }}</span>
            </div>
            <div style="margin-top: 16px; font-size: 28px; color: #000000; font-weight: 500; text-align: center;">
              请停稳后再起身，下车注意观察后方
            </div>
          </div>
        </div>

        <!-- 线路区域：正常显示线路图 -->
        <div v-else class="route-map">
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
              <span class="station-name" :class="{ 'next-station-name-red': station.isNextStation, 'station-name-two-column': station.isTwoColumn }" v-html="station.formattedName"></span>
              <div class="station-dot" :class="getStationDotClass(station.index)"></div>
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
              <div class="station-dot" :class="getStationDotClass(station.index)"></div>
              <span class="station-name" :class="{ 'next-station-name-red': station.isNextStation, 'station-name-two-column': station.isTwoColumn }" v-html="station.formattedName"></span>
            </div>
          </div>
        </div>

        <!-- Footer: 深蓝色底栏 -->
        <div class="footer">
          <!-- LED滚动文字 -->
          <div v-if="footerLED" class="footer-led">
            <div class="footer-led-content" v-html="parseColorMarkup(footerLED)"></div>
          </div>
          <!-- 水印 -->
          <div v-if="footerWatermark" class="footer-watermark">
            <div class="watermark-item">Metro PIDS</div>
            <div class="watermark-item">Display 2</div>
          </div>
        </div>
      </div>
    </div>
  `
}
