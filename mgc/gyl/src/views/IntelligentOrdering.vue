<!-- 智能订购中心页面：地图调度、AI参数配置、订单处理与趋势分析 -->
<script setup lang="ts">
/** 智能订购与调度页面（已接入后端） */
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import * as echarts from 'echarts'
import chinaJson from '@/assets/china.json'

echarts.registerMap('china', chinaJson as any)
import {
  Location,
  Van,
  ShoppingCart,
  Cpu,
  Tickets,
  MapLocation,
  OfficeBuilding,
  LocationFilled,
  QuestionFilled
} from '@element-plus/icons-vue'

// --- API 地址 ---
const API_BASE = 'http://localhost:3000/api'

// --- 数据状态容器 ---
const products = ref<any[]>([])
const pastures = ref<any[]>([])
const distributors = ref<any[]>([])
const inventories = ref<any[]>([])

// 订单分页与列表
const orders = ref<any[]>([])
const totalOrders = ref(0)
const currentPage = ref(1)
const pageSize = ref(15)
const loadingOrders = ref(false)

// 页面权限与匹配参数控制
const currentUserLevel = ref('L1')
const alpha = ref(1.0)
const beta = ref(1.5)

// 鍦板浘瀹炰緥
let chartMapInstance: echarts.ECharts | null = null
const mapContainerRef = ref<HTMLElement | null>(null)

// 触发重新居中
const resetMap = () => {
  if (chartMapInstance) {
    chartMapInstance.dispatchAction({
      type: 'restore'
    });
  }
}

// --- 数据获取与初始化逻辑 ---

const fetchData = async () => {
    try {
        // 1. 获取商品主数据
        const proRes = await axios.get(`${API_BASE}/products`)
        products.value = proRes.data.data

        // 2. 获取仓库数据（分离出牧场和终端网点）
        const whRes = await axios.get(`${API_BASE}/warehouses`)
        const warehouses = whRes.data.data || []
        
        pastures.value = warehouses
            .filter((w: any) => w.warehouse_type === 3)
            .map((p: any) => ({
                id: p.id,
                name: p.warehouse_name,
                lat: parseFloat(p.latitude || 0),
                lng: parseFloat(p.longitude || 0),
                coldStorageStatus: Math.random() > 0.1 ? 'Normal' : 'Maintenance' // 演示状态
            }))

        distributors.value = warehouses
            .filter((w: any) => w.warehouse_type === 4 || w.warehouse_type === 1 || w.warehouse_type === 2)
            .map((d: any) => ({
                id: d.id,
                name: d.warehouse_name,
                level: d.contact_person || 'L3',  // fallback
                lat: parseFloat(d.latitude || 0),
                lng: parseFloat(d.longitude || 0),
                warehouse_type: d.warehouse_type
            }))
            
        // 3. 初始拉取订单
        await fetchOrders()
        
    } catch (err) {
        ElMessage.error('无法连接后端 API，请检查 Node.js 服务是否已在 3000 端口运行')
        console.error(err)
    }
}

const fetchOrders = async () => {
    loadingOrders.value = true
    try {
        const res = await axios.get(`${API_BASE}/orders?page=${currentPage.value}&limit=${pageSize.value}`)
        if (res.data.code === 200) {
            totalOrders.value = res.data.data.total
            // 将蛇形命名转为驼峰适配原有逻辑
            orders.value = res.data.data.list.map((o: any) => ({
                ...o,
                orderId: o.order_id,
                distributorId: o.distributor_id,
                skuId: o.sku_id,
                requestLiters: parseFloat(o.request_liters),
                sourcePastureId: o.source_pasture_id,
                matchScore: parseFloat(o.match_score),
                createTime: o.create_time
            }))
        }
    } catch (err) {
        ElMessage.error('订单拉取失败')
    } finally {
        loadingOrders.value = false
    }
}

const handlePageChange = (page: number) => {
    currentPage.value = page
    fetchOrders()
}

// --- 订单分析区域数据 ---
const analysis = ref<any>(null)
const chartRegionRef = ref<HTMLElement | null>(null)
const chartTrendRef = ref<HTMLElement | null>(null)
let chartRegionInstance: echarts.ECharts | null = null
let chartTrendInstance: echarts.ECharts | null = null
const coreRegions = ['华东', '华中', '华南', '华北']

const formatWanLiters = (value: number) => (Number(value || 0) / 10000).toFixed(1)

const overviewCards = computed(() => {
  const data = analysis.value
  if (!data) {
    return [
      { label: '待调度订单', value: '--', meta: '待分配 -- 万升', tone: 'warning' },
      { label: '已智能匹配', value: '--', meta: '已匹配 -- 万升', tone: 'success' },
      { label: '匹配完成率', value: '--', meta: '总订单 -- 笔', tone: 'primary' },
      { label: '核心四区承接量', value: '--', meta: '西南观察 -- 万升', tone: 'info' }
    ]
  }
  return [
    {
      label: '待调度订单',
      value: data.pendingOrders,
      meta: `待分配 ${formatWanLiters(data.pendingLiters)} 万升`,
      tone: 'warning'
    },
    {
      label: '已智能匹配',
      value: data.matchedOrders,
      meta: `已匹配 ${formatWanLiters(data.matchedLiters)} 万升`,
      tone: 'success'
    },
    {
      label: '匹配完成率',
      value: `${Number(data.matchRate || 0).toFixed(1)}%`,
      meta: `总订单 ${data.totalOrders || 0} 笔`,
      tone: 'primary'
    },
    {
      label: '核心四区承接量',
      value: `${formatWanLiters(data.coreRegionLiters)} 万升`,
      meta: `西南观察 ${formatWanLiters(data.westRegionLiters)} 万升`,
      tone: 'info'
    }
  ]
})

const warningHighlights = computed(() => {
  const data = analysis.value
  if (!data) return []
  const riskRegions = (data.regionLoad || []).filter((item: any) => item.alertLevel !== 'healthy')
  return [
    {
      label: '区域积压预警',
      value: `${data.alertSummary?.criticalRegionCount || 0} 个`,
      meta: riskRegions.length ? riskRegions.filter((item: any) => item.alertLevel === 'critical').map((item: any) => `${item.region} ${item.pendingRate}%`).join(' / ') : '四区负荷平稳',
      tone: 'critical'
    },
    {
      label: '关注区域',
      value: `${data.alertSummary?.attentionRegionCount || 0} 个`,
      meta: `全国待分摊 ${formatWanLiters(data.nationalPendingLiters)} 万升`,
      tone: 'attention'
    },
    {
      label: '低温待调度',
      value: `${data.alertSummary?.lowTempPendingOrders || 0} 单`,
      meta: `${formatWanLiters(data.alertSummary?.lowTempPendingLiters || 0)} 万升`,
      tone: 'neutral'
    }
  ]
})

const fetchAnalysis = async () => {
  try {
    const res = await axios.get(`${API_BASE}/order-analysis`)
    if (res.data.code === 200) {
      analysis.value = res.data.data
      await nextTick()
      renderCharts()
    }
  } catch (err) {
    console.warn('订单分析接口不可用')
  }
}

const renderCharts = () => {
  // 四大区域需求对比图
  if (chartRegionRef.value) {
    chartRegionInstance = chartRegionInstance || echarts.init(chartRegionRef.value, 'dark')
    const regions = coreRegions
    const values = regions.map((region) => Number(analysis.value.regionStats?.[region] || 0))
    const total = values.reduce((a, b) => a + b, 0)
    chartRegionInstance.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        formatter: (p: any) => {
          const point = p?.[0]
          if (!point) return ''
          const percent = total > 0 ? ((Number(point.value || 0) / total) * 100).toFixed(1) : '0.0'
          return `${point.name}<br/>需求量: <b>${(Number(point.value || 0) / 10000).toFixed(1)}万升</b><br/>核心四区占比: <b>${percent}%</b>`
        }
      },
      grid: { left: 36, right: 16, top: 16, bottom: 32 },
      xAxis: { type: 'category', data: regions, axisLabel: { color: '#94a3b8', fontSize: 13, fontWeight: 'bold' }, axisLine: { lineStyle: { color: '#334155' } } },
      yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: (v: number) => `${(v/10000).toFixed(0)}万升` }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [{
        type: 'bar', data: values, barMaxWidth: 60,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: (params: any) => {
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']
            return colors[params.dataIndex % colors.length]
          }
        },
        label: { show: true, position: 'top', color: '#94a3b8', formatter: (p: any) => `${total > 0 ? ((p.value / total) * 100).toFixed(1) : '0.0'}%` }
      }]
    })
  }

  // 7澶╂秼鍑鸿揣閲忚秼鍔垮浘
  if (chartTrendRef.value) {
    chartTrendInstance = chartTrendInstance || echarts.init(chartTrendRef.value, 'dark')
    const trend = analysis.value.sevenDayTrend || []
    chartTrendInstance.setOption({
      backgroundColor: 'transparent',
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        data: ['核心四区承接量', '西南观察量', '待调度量']
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(148, 163, 184, 0.2)',
        textStyle: { color: '#e2e8f0' },
        formatter: (points: any[]) => {
          const rows = (points || []).map((point) => `${point.marker}${point.seriesName}: <b>${formatWanLiters(Number(point.value || 0))} 万升</b>`)
          return [`${points?.[0]?.axisValue || ''}`, ...rows].join('<br/>')
        }
      },
      grid: { left: 52, right: 16, top: 44, bottom: 32 },
      xAxis: {
        type: 'category',
        data: trend.map((d: any) => d.date),
        axisLabel: { color: '#94a3b8', formatter: (value: string) => value.slice(5) },
        axisLine: { lineStyle: { color: '#334155' } }
      },
      yAxis: { type: 'value', axisLabel: { color: '#64748b', formatter: (v: number) => `${(v/10000).toFixed(0)}万升` }, splitLine: { lineStyle: { color: '#1e293b' } } },
      series: [
        {
          name: '待调度量',
          type: 'bar',
          data: trend.map((d: any) => d.pendingCoreLiters),
          barMaxWidth: 18,
          itemStyle: {
            color: 'rgba(239, 68, 68, 0.35)',
            borderRadius: [4, 4, 0, 0]
          }
        },
        {
          name: '核心四区承接量',
          type: 'line',
          data: trend.map((d: any) => d.coreLiters),
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { color: '#38bdf8', width: 3 },
          itemStyle: { color: '#38bdf8', borderWidth: 2, borderColor: '#0f172a' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(56,189,248,0.28)' },
                { offset: 1, color: 'rgba(56,189,248,0.03)' }
              ]
            }
          }
        },
        {
          name: '西南观察量',
          type: 'line',
          data: trend.map((d: any) => d.westLiters),
          smooth: true,
          symbol: 'emptyCircle',
          symbolSize: 7,
          lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' },
          itemStyle: { color: '#f59e0b', borderColor: '#0f172a', borderWidth: 2 }
        }
      ]
    })
  }
}

onMounted(() => {
    fetchData()
    fetchAnalysis()
})

onUnmounted(() => {
  chartRegionInstance?.dispose()
  chartTrendInstance?.dispose()
})

// 前端权限过滤（演示用途）
const filteredOrders = computed(() => {
  if (currentUserLevel.value === 'L3') {
    return orders.value.filter(o => o.distributorId === 'D_L3_BJ_CY')
  }
  return orders.value
})

// 动态连线：只展示流向 L1/L2 节点的业务线
const activeFlows = computed(() => {
  return filteredOrders.value
    .filter(o => o.status === 'Matched' && o.sourcePastureId)
    .map(o => {
      const p = pastures.value.find(x => x.id === o.sourcePastureId)
      const d = distributors.value.find(x => x.id === o.distributorId && (x.warehouse_type === 1 || x.warehouse_type === 2))
      if (p && d && p.lng && d.lng) {
        return {
          coords: [[p.lng, p.lat], [d.lng, d.lat]]
        }
      }
      return null
    }).filter(Boolean).slice(0, 30) as any[] // 淇濇寔 30 鏉℃牳蹇冭繛绾匡紝纭繚鍔ㄧ敾娴佺晠
})

// 地图只展示 L1 总部和 L2 RDC 大区中心
const renderDistributors = computed(() =>
  distributors.value.filter(d => d.warehouse_type === 1 || d.warehouse_type === 2)
)

// --- 鍦板浘娓叉煋鏍稿績閫昏緫 ---
const renderMap = () => {
  if (!chartMapInstance && mapContainerRef.value) {
    chartMapInstance = echarts.init(mapContainerRef.value, 'dark')
    chartMapInstance.on('click', (params: any) => {
      // 点击牧场或核心仓时显示详情
      if ((params.seriesType === 'scatter' || params.seriesType === 'effectScatter') && params.data && params.data.id) {
        showPastureDetail(params.data.id)
      }
    })
  }
  if (!chartMapInstance) return

  // 整理牧场（前置仓）数据 -> 蓝色
  const pastureSeriesData = pastures.value.map(p => ({
    id: p.id,
    name: p.name,
    value: [p.lng, p.lat, 1], // [lng, lat, value]
    itemStyle: { color: '#38bdf8', shadowBlur: 10, shadowColor: '#38bdf8' }
  }))

  // 整理 L1 总部数据 -> 金色发光
  const hqSeriesData = renderDistributors.value.filter(d => d.warehouse_type === 1).map(d => ({
    id: d.id,
    name: d.name,
    value: [d.lng, d.lat, 1],
    itemStyle: { color: '#fbbf24', shadowBlur: 20, shadowColor: '#fbbf24' }
  }))

  // 鏁寸悊 L2 RDC 鏁版嵁 -> 姗欒壊
  const rdcSeriesData = renderDistributors.value.filter(d => d.warehouse_type === 2).map(d => ({
    id: d.id,
    name: d.name,
    value: [d.lng, d.lat, 1],
    itemStyle: { color: '#f97316', shadowBlur: 10, shadowColor: '#f97316' }
  }))

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (params.seriesType === 'lines') return ''
        return `<b>${params.name}</b><br/>绫诲瀷: ${params.seriesName}`
      }
    },
    geo: {
      map: 'china',
      roam: true, // 开启缩放和平移
      zoom: 1.2,
      label: {
        show: false, // 不显示省份名称以保持简洁
        color: 'rgba(255,255,255,0.5)'
      },
      itemStyle: {
        areaColor: '#0f172a',
        borderColor: '#38bdf8',
        borderWidth: 1
      },
      emphasis: {
        itemStyle: {
          areaColor: '#1e293b'
        },
        label: { show: false }
      }
    },
    series: [
      {
        name: '牧场 / 前置仓',
        type: 'scatter',
        coordinateSystem: 'geo',
        data: pastureSeriesData,
        symbolSize: 8,
      },
      {
        name: 'L2 RDC大区中心',
        type: 'scatter', // 涔熷彲浠ョ敤 effectScatter
        coordinateSystem: 'geo',
        data: rdcSeriesData,
        symbolSize: 10,
        label: {
          show: true,
          formatter: '{b}',
          position: 'right',
          color: '#e2e8f0',
          fontSize: 10
        }
      },
      {
        name: 'L1 鲜链总部',
        type: 'effectScatter', // 鍙戝厜鍔ㄧ敾娉㈢汗
        coordinateSystem: 'geo',
        data: hqSeriesData,
        symbolSize: 16,
        showEffectOn: 'render',
        rippleEffect: {
          brushType: 'fill',
          scale: 4
        },
        label: {
          show: true,
          formatter: '{b}',
          position: 'right',
          color: '#fbbf24',
          fontSize: 12,
          fontWeight: 'bold'
        },
        zlevel: 1
      },
      {
        name: '鏅鸿兘璋冨害鍔ㄧ嚎',
        type: 'lines',
        coordinateSystem: 'geo',
        zlevel: 2,
        effect: {
          show: true,
          period: 4,
          trailLength: 0.2, // 灏捐抗闀垮害
          color: '#10b981',
          symbol: 'arrow',
          symbolSize: 5
        },
        lineStyle: {
          color: '#10b981',
          width: 2,
          opacity: 0.1, // 主干线更淡，突出动画
          curveness: 0.3 // 鏇茬嚎缇庡寲
        },
        data: activeFlows.value
      }
    ]
  }

  chartMapInstance.setOption(option)
}

// 鐩戝惉鏁版嵁鍙樺寲閲嶆柊娓叉煋鍦板浘
watch([pastures, renderDistributors, activeFlows], () => {
  nextTick(() => {
    renderMap()
  })
}, { deep: true })


const getSkuDetails = (skuId: string) => products.value.find(s => s.product_code === skuId)
const getDistributorName = (dId: string) => distributors.value.find(d => d.id === dId)?.name

// --- 一键智能匹配 ---
const handleAutoMatch = (row: any) => {
  // 原型演示：本地随机给出匹配结果
  const pastureTarget = pastures.value[Math.floor(Math.random() * pastures.value.length)]
  const score = (Math.random() * 20 + 80).toFixed(1)
  
  const target = orders.value.find(o => o.orderId === row.orderId)
  if (target) {
    target.status = 'Matched'
    target.sourcePastureId = pastureTarget?.id
    target.matchScore = score
    ;(target as any)._freshnessRemaining = Math.floor(Math.random() * 70 + 10)
    ElMessage.success(`订单 ${row.orderId} AI匹配成功：${pastureTarget?.name}（评分：${score}）`)
  }
}

// 牧场实况弹窗
const pastureDialogVisible = ref(false)
const selectedPasture = ref<any>(null)

const showPastureDetail = (pastureId: string) => {
  const p = pastures.value.find(p => p.id === pastureId)
  if (p) {
    selectedPasture.value = p
    pastureDialogVisible.value = true
  }
}

// 获取新鲜度进度条百分比与状态
const getFreshnessProps = (row: any) => {
  const sku = getSkuDetails(row.skuId)
  if (!sku || sku.material_type !== 'LowTemp') return null
  if (row.status === 'Pending') return null
  
  let remainingHours = row._freshnessRemaining || 48
  const shelfLifeHours = sku.shelf_life * 24
  
  const percent = Number(((remainingHours / shelfLifeHours) * 100).toFixed(0))
  const isDanger = percent < 30
  
  return {
    percent: Math.min(100, percent),
    remainingHours: remainingHours.toFixed(1),
    isDanger,
    color: isDanger ? '#ef4444' : '#10b981'
  }
}

</script>

<template>
  <div class="ordering-page">
    <!-- 智能看板区域 -->
    <el-row :gutter="20" class="dashboard-row">
      <!-- 地图调度看板 -->
      <el-col :xl="16" :lg="16" :md="24" :sm="24" :xs="24" class="map-col">
        <div class="map-board">
          <div class="map-header">
            <h3 class="map-title"><el-icon><Location /></el-icon> 鲜链 (Fresh-Link) 全国网点大盘（<span style="color:#10b981; font-weight: bold;">{{ distributors.length }}</span> 个终端节点）</h3>
            <div class="map-controls">
                <el-button size="small" circle icon="Refresh" @click="resetMap" title="重置视角"></el-button>
                <span class="live-tag"><span></span>LIVE</span>
            </div>
          </div>
          <div class="map-viewport" ref="mapContainerRef" style="width: 100%; height: 100%; position: relative;">
          </div>
        </div>
      </el-col>

      <!-- 匹配因子配置区域 -->
      <el-col :xl="8" :lg="8" :md="24" :sm="24" :xs="24" class="config-col">
        <div class="config-board page-card">
          <div class="page-card-title config-title">
            <div><el-icon><Cpu /></el-icon> AI 决策引擎网络态势</div>
            <el-tooltip effect="dark" placement="left">
              <template #content>
                 <div style="line-height: 1.8; font-size: 13px;">
                  <strong style="color: #38bdf8;">核心匹配评分公式 (Scoring Formula):</strong><br/>
                  <span style="font-family: monospace; font-size: 14px; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">
                    Score = (100 - Dist × α) + (Freshness × β) + Bias
                  </span><br/><br/>
                  <div style="color: #cbd5e1;">
                    - <strong>距离权重 (α)</strong>：值越大，物理距离对匹配得分的惩罚越明显。<br/>
                    - <strong>新鲜度溢价 (β)</strong>：值越大，越接近保质期边界的货物越优先分配。<br/>
                    - <strong>网点等级 (Bias)</strong>：L1 > L2 > L3，高优网点天然具备优先调度权。
                  </div>
                </div>
              </template>
              <el-icon style="cursor: pointer; font-size: 16px; color: #94a3b8; transition: color 0.2s;" class="help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>

          <!-- 统计摘要 -->
          <div class="stats-mini">
            <div v-for="item in overviewCards" :key="item.label" class="stat-box" :class="`is-${item.tone}`">
              <span class="label">{{ item.label }}</span>
              <span class="val">{{ item.value }}</span>
              <span class="stat-meta">{{ item.meta }}</span>
            </div>
          </div>
          <div v-if="warningHighlights.length" class="warning-strip">
            <div v-for="item in warningHighlights" :key="item.label" class="warning-pill" :class="`is-${item.tone}`">
              <span class="warning-pill__label">{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <span class="warning-pill__meta">{{ item.meta }}</span>
            </div>
          </div>
          
          <div class="factor-item">
            <div class="factor-header">
              <span>距离权重 (Distance | α)</span>
              <span class="val">{{ alpha }}</span>
            </div>
            <el-slider v-model="alpha" :min="0.1" :max="3.0" :step="0.1" />
          </div>
          
          <div class="factor-item">
            <div class="factor-header">
              <span>新鲜度溢价 (Freshness | β)</span>
              <span class="val">{{ beta }}</span>
            </div>
            <el-slider v-model="beta" :min="0.1" :max="3.0" :step="0.1" />
          </div>
          
          <div class="scope-switch">
            <el-radio-group v-model="currentUserLevel" size="small">
              <el-radio-button value="L1">L1 全局视角</el-radio-button>
              <el-radio-button value="L3">L3 单门店视角</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 订单分析区域 -->
    <el-row :gutter="20" class="analysis-row" v-if="analysis">
      <!-- 四大区需求对比 -->
      <el-col :xl="12" :lg="12" :md="24" :sm="24" :xs="24">
        <div class="analysis-card">
          <div class="analysis-card-title">
            <div>
              <span>&#128202; {{ analysis.chartMeta?.title || '四大核心区域订单需求量对比' }}</span>
              <div class="analysis-note">{{ analysis.chartMeta?.note || '' }}；当前全国直营/电商 {{ formatWanLiters(analysis.nationalDirectLiters || 0) }} 万升，西南 {{ formatWanLiters(analysis.westRegionLiters || 0) }} 万升</div>
            </div>
            <span class="analysis-sub">华东 / 华中 / 华南 / 华北 (万升)</span>
          </div>
          <div ref="chartRegionRef" class="chart-panel" />
        </div>
      </el-col>
      <!-- 7日出货趋势 -->
      <el-col :xl="12" :lg="12" :md="24" :sm="24" :xs="24">
        <div class="analysis-card">
          <div class="analysis-card-title">
            <div>
              <span>&#128200; 近 7 日核心四区承接趋势 (万升)</span>
              <div class="analysis-note">核心四区承接量沿用同一分摊逻辑，西南以观察线单列展示，红柱为待调度量</div>
            </div>
            <div class="kpi-badges">
              <span class="kpi-badge blue">总订单<strong>{{ analysis.totalOrders }}</strong>笔</span>
              <span class="kpi-badge green">核心承接<strong>{{ formatWanLiters(analysis.coreRegionLiters || 0) }}</strong>万升</span>
              <span class="kpi-badge amber">匹配率<strong>{{ Number(analysis.matchRate || 0).toFixed(1) }}</strong>%</span>
            </div>
          </div>
          <div ref="chartTrendRef" class="chart-panel" />
        </div>
      </el-col>
    </el-row>

    <!-- 订单列表（带分页） -->
    <div class="page-card orders-card">
      <div class="page-card-header orders-header">
        <div class="page-card-title">
          <el-icon><Tickets /></el-icon> 订购调度处理清单（当前实时页）
        </div>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="totalOrders"
          @current-change="handlePageChange"
          layout="total, prev, pager, next"
          background
          size="small"
        />
      </div>
      
      <el-table :data="filteredOrders" style="width: 100%" border stripe v-loading="loadingOrders">
        <el-table-column prop="orderId" label="订单号" width="150" />
        <el-table-column label="经销商 / 渠道 / 下属网点" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <div style="font-weight: 500; font-size: 13px;">{{ getDistributorName(row.distributorId) || '门店导入中...' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="订购大类 & SKU" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px">
              <el-tag :type="getSkuDetails(row.skuId)?.material_type === 'LowTemp' ? 'primary' : 'warning'" size="small">
                {{ getSkuDetails(row.skuId)?.material_type === 'LowTemp' ? '低温鲜奶' : '常温系列' }}
              </el-tag>
              <span style="font-size: 13px">{{ getSkuDetails(row.skuId)?.product_name || row.skuId }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="需求量(L)" width="100" prop="requestLiters" align="right">
          <template #default="{ row }">
            <span style="font-family: monospace; font-size: 14px">{{ row.requestLiters }}</span>
          </template>
        </el-table-column>
        <el-table-column label="调度状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'Pending'" type="info" effect="plain" round size="small">待分配</el-tag>
            <el-tag v-else-if="row.status === 'Matched'" type="success" effect="dark" round size="small">已分配</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发货来源牧场/核心仓" min-width="150" align="center">
          <template #default="{ row }">
            <span v-if="!row.sourcePastureId" style="color: var(--text-muted)">-</span>
            <el-button v-else link type="primary" size="small" @click="showPastureDetail(row.sourcePastureId)">
              <el-icon style="margin-right: 4px"><MapLocation /></el-icon>
              {{ pastures.find(p => p.id === row.sourcePastureId)?.name || '虚拟前置仓' }}
            </el-button>
          </template>
        </el-table-column>
        
         <el-table-column label="新鲜度预估指标" width="130" align="center">
          <template #default="{ row }">
            <div v-if="getFreshnessProps(row)">
               <el-progress 
                :percentage="getFreshnessProps(row)?.percent" 
                :color="getFreshnessProps(row)?.color" 
                :stroke-width="5"
                striped 
                striped-flow 
              />
            </div>
            <span v-else style="color: var(--text-muted); font-size: 12px">-</span>
          </template>
        </el-table-column>

        <el-table-column label="操作 / 引擎" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'Pending'" type="primary" size="small" @click="handleAutoMatch(row)">
              <el-icon><Cpu /></el-icon> 调度
            </el-button>
            <span v-else style="font-size: 11px; color: #10b981; font-weight: 500;">
              已分配完成
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>
    
    <!-- 牧场实况对话框 -->
    <el-dialog v-model="pastureDialogVisible" :title="'牧场/前置仓实况节点 - ' + selectedPasture?.name" width="400px">
      <div v-if="selectedPasture" class="pasture-details">
        <div class="coord-label">卫星坐标：Lat {{ selectedPasture.lat }}, Lng {{ selectedPasture.lng }}</div>
        <div class="status-grid">
          <div class="status-card">
            <h4>冷链负荷状态</h4>
            <el-tag :type="selectedPasture.coldStorageStatus === 'Normal' ? 'success' : 'danger'" effect="dark">
              {{ selectedPasture.coldStorageStatus === 'Normal' ? '正常制冷且富余' : '负荷较高预警' }}
            </el-tag>
          </div>
          <div class="status-card">
            <h4>当前可用库存 SKU</h4>
            <div style="font-size: 18px; font-weight: bold; color: var(--primary-color)">152+ 款</div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.ordering-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dashboard-row,
.analysis-row {
  margin-bottom: 0 !important;
}

.map-col,
.config-col {
  display: flex;
}

.map-board {
  width: 100%;
  min-height: 420px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-radius: 14px;
  border: 1px solid rgba(56, 189, 248, 0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
}

.map-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(8px);
  gap: 12px;
  z-index: 20;
}

.map-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: #e2e8f0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
}

.map-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.live-tag {
  color: #ef4444;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 6px;
}

.live-tag span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55);
  animation: livePulse 1.8s infinite;
}

.map-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #020617;
}

.help-icon:hover {
  color: #38bdf8 !important;
}

.config-board {
  width: 100%;
  min-height: 420px;
  height: 100%;
  margin-bottom: 0 !important;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.config-title {
  margin-bottom: 18px !important;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.stats-mini {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.stat-box {
  background: #f8fafc;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  text-align: left;
  min-height: 90px;
}

.stat-box .label {
  display: block;
  font-size: 11px;
  color: #64748b;
  margin-bottom: 5px;
}

.stat-box .val {
  font-size: 20px;
  font-weight: 800;
  color: #1e293b;
  font-family: monospace;
}

.stat-meta {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}

.stat-box.is-warning {
  border-color: rgba(245, 158, 11, 0.28);
  background: linear-gradient(180deg, #fff7ed 0%, #fffbeb 100%);
}

.stat-box.is-success {
  border-color: rgba(16, 185, 129, 0.24);
  background: linear-gradient(180deg, #ecfdf5 0%, #f0fdf4 100%);
}

.stat-box.is-success .val {
  color: #059669;
}

.stat-box.is-primary {
  border-color: rgba(59, 130, 246, 0.24);
  background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%);
}

.stat-box.is-primary .val {
  color: #2563eb;
}

.stat-box.is-info {
  border-color: rgba(14, 165, 233, 0.24);
  background: linear-gradient(180deg, #f0f9ff 0%, #f8fafc 100%);
}

.stat-box.is-info .val {
  color: #0284c7;
}

.warning-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.warning-pill {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: #f8fafc;
}

.warning-pill__label,
.warning-pill__meta {
  display: block;
}

.warning-pill__label {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 6px;
}

.warning-pill strong {
  display: block;
  font-size: 18px;
  line-height: 1.2;
  color: #1e293b;
}

.warning-pill__meta {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: #64748b;
}

.warning-pill.is-critical {
  background: linear-gradient(180deg, #fef2f2 0%, #fff7ed 100%);
  border-color: rgba(239, 68, 68, 0.22);
}

.warning-pill.is-critical strong {
  color: #dc2626;
}

.warning-pill.is-attention {
  background: linear-gradient(180deg, #fff7ed 0%, #fffbeb 100%);
  border-color: rgba(245, 158, 11, 0.22);
}

.warning-pill.is-attention strong {
  color: #d97706;
}

.warning-pill.is-neutral {
  background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%);
  border-color: rgba(59, 130, 246, 0.18);
}

.warning-pill.is-neutral strong {
  color: #2563eb;
}

.factor-item {
  margin-bottom: 18px;
}

.factor-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.factor-header .val {
  color: var(--primary-color);
  font-family: monospace;
  font-size: 15px;
}

.scope-switch {
  margin-top: auto;
  text-align: right;
  padding-top: 10px;
}

.coord-label {
  font-family: monospace;
  background: #f1f5f9;
  padding: 8px 12px;
  border-radius: 6px;
  color: #475569;
  margin-bottom: 16px;
  text-align: center;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.status-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.status-card h4 {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 8px 0;
  font-weight: 500;
}

.analysis-card {
  min-height: 274px;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-radius: 12px;
  padding: 16px 18px;
  border: 1px solid rgba(56, 189, 248, 0.12);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
}

.analysis-card-title {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  gap: 12px;
}

.analysis-note {
  margin-top: 4px;
  max-width: 460px;
  font-size: 11px;
  line-height: 1.5;
  color: #94a3b8;
  font-weight: 400;
}

.analysis-sub {
  font-size: 11px;
  color: #64748b;
  font-weight: 400;
}

.chart-panel {
  height: 210px;
  margin-top: auto;
}

.kpi-badges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.kpi-badge {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 20px;
  color: #e2e8f0;
}

.kpi-badge.blue {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.4);
}

.kpi-badge.green {
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.kpi-badge.amber {
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.4);
}

.kpi-badge strong {
  margin: 0 3px;
  font-size: 14px;
}

.orders-card {
  margin-bottom: 0;
}

.orders-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.orders-header :deep(.el-pagination) {
  margin-left: auto;
}

@media (max-width: 1400px) {
  .map-board,
  .config-board {
    min-height: 390px;
  }
}

@media (max-width: 1200px) {
  .warning-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 992px) {
  .map-board {
    min-height: 360px;
  }

  .config-board {
    min-height: 0;
    height: auto;
  }

  .warning-strip {
    grid-template-columns: 1fr;
  }

  .analysis-card {
    min-height: 260px;
  }

  .analysis-card-title {
    flex-direction: column;
  }

  .analysis-sub {
    display: none;
  }

  .scope-switch {
    text-align: left;
    margin-top: 14px;
  }
}

@media (max-width: 768px) {
  .ordering-page {
    gap: 16px;
  }

  .map-header {
    padding: 10px 14px;
    flex-wrap: wrap;
  }

  .map-title {
    font-size: 14px;
  }

  .config-title {
    align-items: center;
    margin-bottom: 14px !important;
  }

  .stats-mini {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .stat-box {
    min-height: 0;
  }

  .factor-item {
    margin-bottom: 14px;
  }

  .analysis-card {
    padding: 14px;
  }

  .chart-panel {
    height: 200px;
  }

  .orders-header :deep(.el-pagination) {
    margin-left: 0;
    width: 100%;
    justify-content: flex-start;
  }

  .status-grid {
    grid-template-columns: 1fr;
  }
}

@keyframes livePulse {
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}
</style>




