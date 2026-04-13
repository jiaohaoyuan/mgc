<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import axios from 'axios'

const windowMinutes = ref(1440)
const monitor = reactive({
  totalCalls: 0,
  errorCalls: 0,
  errorRate: 0,
  slowApiCount: 0,
  apiTop: [] as any[],
  slowApis: [] as any[],
  taskSummary: {
    totalTasks: 0,
    successTasks: 0,
    failedTasks: 0,
    runningTasks: 0,
    taskSuccessRate: 0
  }
})

const fetchMonitor = async () => {
  const { data } = await axios.get('/platform/monitor/overview', {
    params: { windowMinutes: windowMinutes.value }
  })
  Object.assign(monitor, data?.data || {})
}

onMounted(fetchMonitor)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="head">接口与任务监控</div>
      </template>

      <div class="toolbar">
        <el-select v-model="windowMinutes" style="width: 180px">
          <el-option :value="60" label="最近1小时" />
          <el-option :value="360" label="最近6小时" />
          <el-option :value="1440" label="最近24小时" />
          <el-option :value="10080" label="最近7天" />
        </el-select>
        <el-button type="primary" @click="fetchMonitor">刷新</el-button>
      </div>

      <div class="summary">
        <span>接口调用量 {{ monitor.totalCalls }}</span>
        <span>错误请求数 {{ monitor.errorCalls }}</span>
        <span>错误率 {{ Number(monitor.errorRate || 0).toFixed(2) }}%</span>
        <span>慢接口数 {{ monitor.slowApiCount }}</span>
        <span>任务成功率 {{ Number(monitor.taskSummary?.taskSuccessRate || 0).toFixed(2) }}%</span>
      </div>

      <el-table :data="monitor.apiTop" border>
        <el-table-column prop="api" label="接口" min-width="320" show-overflow-tooltip />
        <el-table-column prop="call_count" label="调用量" width="100" />
        <el-table-column prop="error_count" label="错误数" width="100" />
        <el-table-column prop="error_rate" label="错误率(%)" width="110" />
        <el-table-column prop="avg_duration_ms" label="平均耗时(ms)" width="130" />
        <el-table-column prop="max_duration_ms" label="最大耗时(ms)" width="130" />
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="head">慢接口列表</div>
      </template>

      <el-table :data="monitor.slowApis" border>
        <el-table-column prop="api" label="接口" min-width="320" show-overflow-tooltip />
        <el-table-column prop="call_count" label="调用量" width="100" />
        <el-table-column prop="avg_duration_ms" label="平均耗时(ms)" width="130" />
        <el-table-column prop="max_duration_ms" label="最大耗时(ms)" width="130" />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }
.head { font-size: 16px; font-weight: 600; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.summary { display: flex; gap: 18px; margin-bottom: 12px; color: #475569; font-size: 13px; flex-wrap: wrap; }
</style>
