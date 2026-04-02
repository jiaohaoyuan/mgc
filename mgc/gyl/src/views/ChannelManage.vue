<!-- 这个文件是什么作用显示的是什么：这是渠道管理页面。显示/实现的是：销售渠道（如线上、线下等）的列表和维护界面。 -->
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { DataAnalysis, OfficeBuilding, MapLocation, Shop } from '@element-plus/icons-vue'

const API_BASE = 'http://localhost:3000/api'
const channels = ref<any[]>([])
const loading = ref(false)
const filterType = ref('All')

const fetchChannels = async () => {
  loading.value = true
  try {
    const res = await axios.get(`${API_BASE}/warehouses`)
    if (res.data.code === 200) {
      // 过滤掉牧场 (type 3)，只留下渠道网点：1总仓，2RDC分拨，4终端门店
      channels.value = res.data.data.filter((w: any) => w.warehouse_type !== 3).map((w: any) => ({
          id: w.id,
          code: w.warehouse_code,
          name: w.warehouse_name,
          type: w.warehouse_type,
          lat: parseFloat(w.latitude || 0).toFixed(4),
          lng: parseFloat(w.longitude || 0).toFixed(4),
          level: w.contact_person || (w.warehouse_type === 1 ? 'L1' : (w.warehouse_type === 2 ? 'L2' : 'L3'))
      }))
    } else {
      ElMessage.error(res.data.msg)
    }
  } catch (err) {
    ElMessage.error('获取渠道数据失败，请检查服务是否开启')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchChannels()
})

const filteredChannels = computed(() => {
  if (filterType.value === 'L1') return channels.value.filter(c => c.type === 1)
  if (filterType.value === 'L2') return channels.value.filter(c => c.type === 2)
  if (filterType.value === 'L3') return channels.value.filter(c => c.type === 4)
  return channels.value
})

const getChannelTypeName = (type: number) => {
  switch (type) {
    case 1: return 'L1 全国总仓'
    case 2: return 'L2 大区RDC中心'
    case 4: return 'L3 终端业务网点'
    default: return '其他未划定'
  }
}

const getChannelTypeTag = (type: number) => {
  switch (type) {
    case 1: return 'danger'
    case 2: return 'warning'
    case 4: return 'primary'
    default: return 'info'
  }
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div class="page-title">
        <el-icon><DataAnalysis /></el-icon> 三级分销网络统筹 (Channels)
      </div>
      <div class="page-actions">
        <el-radio-group v-model="filterType" size="small">
          <el-radio-button value="All">全部节点 ({{ channels.length }})</el-radio-button>
          <el-radio-button value="L1">L1 总部</el-radio-button>
          <el-radio-button value="L2">L2 分拨大仓</el-radio-button>
          <el-radio-button value="L3">L3 门店终端</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- 数据表 -->
    <div class="page-card">
      <el-table :data="filteredChannels" style="width: 100%" border stripe v-loading="loading">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="code" label="网点识别码" width="160" />
        <el-table-column label="网络层级 / 设施名称" min-width="280">
          <template #default="{ row }">
            <div style="font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px;">
               <el-icon v-if="row.type === 1" style="color:#ef4444"><OfficeBuilding /></el-icon>
               <el-icon v-else-if="row.type === 2" style="color:#f59e0b"><MapLocation /></el-icon>
               <el-icon v-else-if="row.type === 4" style="color:#3b82f6"><Shop /></el-icon>
               {{ row.name }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="节点性质" width="180" align="center">
          <template #default="{ row }">
            <el-tag :type="getChannelTypeTag(row.type)" effect="dark" round>
              {{ getChannelTypeName(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="系统业务优先级" width="150" align="center">
          <template #default="{ row }">
            <span style="font-family: monospace; font-size: 14px; font-weight: bold; color: var(--text-primary)">
              {{ row.level }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="测绘坐标 (Lng / Lat)" min-width="180" align="center">
          <template #default="{ row }">
            <span style="color: #64748b; font-family: monospace;">{{ row.lng }} / {{ row.lat }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}
.page-card {
  background: #ffffff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
</style>
