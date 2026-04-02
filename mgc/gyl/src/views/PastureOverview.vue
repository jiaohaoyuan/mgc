<!-- 这个文件是什么作用显示的是什么：这是牧场大屏总览页面。显示/实现的是：牧场的总体数据指标、概览图表和其他核心业务大屏展示。 -->
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { Van, Location, Odometer, Search } from '@element-plus/icons-vue'

const API_BASE = 'http://localhost:3000/api'
const pastures = ref<any[]>([])
const loading = ref(false)

// 筛选条件
const searchName = ref('')
const filterAqi = ref('All') // 'All' | 'Good' | 'Fine'

// 过滤后的列表
const filteredPastures = computed(() => {
  let list = pastures.value
  if (searchName.value.trim()) {
    list = list.filter(p => p.name.includes(searchName.value.trim()))
  }
  if (filterAqi.value === 'Good') {
    list = list.filter(p => p.aqi < 35)
  } else if (filterAqi.value === 'Fine') {
    list = list.filter(p => p.aqi >= 35)
  }
  return list
})

const fetchPastures = async () => {
  loading.value = true
  try {
    const res = await axios.get(`${API_BASE}/pasture-stats`)
    if (res.data.code === 200) {
      pastures.value = res.data.data
    } else {
      ElMessage.error(res.data.msg)
    }
  } catch (err) {
    ElMessage.error('获取牧场数据失败，请检查服务是否开启')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchPastures()
})
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">
        <el-icon><Van /></el-icon> 牧场概览与环境监测
        <span class="result-count">共 <strong>{{ filteredPastures.length }}</strong> / {{ pastures.length }} 个牧场</span>
      </div>
      <div class="page-actions">
        <el-input
          v-model="searchName"
          placeholder="按牧场名称搜索…"
          :prefix-icon="Search"
          clearable
          style="width: 220px; margin-right: 12px;"
        />
        <el-radio-group v-model="filterAqi" size="small" style="margin-right: 12px;">
          <el-radio-button value="All">全部 AQI</el-radio-button>
          <el-radio-button value="Good">
            <span style="color: #10b981; font-weight: bold;">优质 (&lt;35)</span>
          </el-radio-button>
          <el-radio-button value="Fine">
            <span style="color: #f59e0b; font-weight: bold;">良好 (≥35)</span>
          </el-radio-button>
        </el-radio-group>
        <el-button type="primary" icon="Refresh" @click="fetchPastures" :loading="loading">刷新</el-button>
      </div>
    </div>

    <!-- 无结果提示 -->
    <el-empty description="没有符合筛选条件的牧场" v-if="!loading && filteredPastures.length === 0" />

    <!-- 骨架屏 -->
    <el-skeleton :rows="5" animated v-if="loading && pastures.length === 0" />

    <el-row :gutter="20" v-else>
      <el-col :span="8" v-for="item in filteredPastures" :key="item.id" style="margin-bottom: 20px;">
        <el-card class="pasture-card" shadow="hover">
          <div class="card-header">
            <span class="pasture-name" :title="item.name">{{ item.name }}</span>
            <el-tag :type="item.aqi < 35 ? 'success' : 'warning'" size="small" effect="plain" style="font-weight:bold;">
              AQI: {{ item.aqi }} ({{ item.airQuality }})
            </el-tag>
          </div>
          <div class="card-body">
            <div class="info-item">
              <el-icon><Location /></el-icon>
              <span>坐标: 经度 {{ item.lng }} / 纬度 {{ item.lat }}</span>
            </div>
            
            <div class="yield-section">
              <div class="yield-title"><el-icon><Odometer /></el-icon> 过去三天原奶出栏量 (L)</div>
              <div class="yield-stats">
                <div class="yield-day">
                  <div class="y-label">T-1</div>
                  <div class="y-val">{{ item.yields[0].toLocaleString() }}</div>
                </div>
                <div class="yield-day">
                  <div class="y-label">T-2</div>
                  <div class="y-val">{{ item.yields[1].toLocaleString() }}</div>
                </div>
                <div class="yield-day">
                  <div class="y-label">T-3</div>
                  <div class="y-val">{{ item.yields[2].toLocaleString() }}</div>
                </div>
              </div>
              <div class="yield-total">
                滚动三日总计: <span class="highlight">{{ item.totalYield.toLocaleString() }} L</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.page-container {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}
.page-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.result-count {
  font-size: 13px;
  font-weight: normal;
  color: #64748b;
  margin-left: 12px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}
.pasture-card {
  border-radius: 12px;
  border: none;
  background: #ffffff;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 12px;
  margin-bottom: 12px;
}
.pasture-name {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}
.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: 13px;
  margin-bottom: 16px;
}
.yield-section {
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px;
}
.yield-title {
  font-size: 13px;
  color: #475569;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.yield-stats {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
.yield-day {
  text-align: center;
  flex: 1;
}
.yield-day:not(:last-child) {
  border-right: 1px solid #e2e8f0;
}
.y-label {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
}
.y-val {
  font-size: 15px;
  font-weight: bold;
  font-family: monospace;
  color: #3b82f6;
}
.yield-total {
  text-align: center;
  font-size: 12px;
  color: #64748b;
  padding-top: 8px;
  border-top: 1px dashed #cbd5e1;
}
.yield-total .highlight {
  font-weight: bold;
  color: #10b981;
  font-size: 14px;
}
</style>
