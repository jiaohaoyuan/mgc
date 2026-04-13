<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import axios from 'axios'

const pretty = (value: unknown) => JSON.stringify(value ?? {}, null, 2)

const query = reactive({
  page: 1,
  pageSize: 20,
  operatorName: '',
  moduleCode: '',
  actionType: '',
  dateFrom: '',
  dateTo: ''
})
const dateRange = ref<string[]>([])
const rows = ref<any[]>([])
const total = ref(0)
const detailVisible = ref(false)
const detailData = ref<any>(null)

const fetchRows = async () => {
  query.dateFrom = dateRange.value?.[0] || ''
  query.dateTo = dateRange.value?.[1] || ''
  const { data } = await axios.get('/platform/audit-logs', { params: query })
  rows.value = data?.data?.list || []
  total.value = Number(data?.data?.total || 0)
}

const openDetail = async (id: number) => {
  const { data } = await axios.get(`/platform/audit-logs/${id}`)
  detailData.value = data?.data || null
  detailVisible.value = true
}

const exportRows = async () => {
  const { data } = await axios.get('/platform/audit-logs/export', { params: query, responseType: 'blob' })
  const href = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = href
  a.download = `audit_logs_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(href)
}

onMounted(fetchRows)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="head">审计日志查询页</div>
      </template>

      <div class="toolbar">
        <el-input v-model="query.operatorName" placeholder="操作人" clearable style="width: 160px" />
        <el-input v-model="query.moduleCode" placeholder="模块" clearable style="width: 140px" />
        <el-input v-model="query.actionType" placeholder="动作" clearable style="width: 140px" />
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" style="width: 280px" />
        <el-button type="primary" @click="query.page = 1; fetchRows()">查询</el-button>
        <el-button @click="exportRows">导出</el-button>
      </div>

      <el-table :data="rows" border>
        <el-table-column prop="created_at" label="时间" min-width="170" />
        <el-table-column prop="operator_name" label="操作人" width="120" />
        <el-table-column prop="module_code" label="模块" width="130" />
        <el-table-column prop="action_type" label="动作" width="130" />
        <el-table-column label="变更差异" width="110">
          <template #default="{ row }">{{ row.diff_summary?.changedCount || 0 }}</template>
        </el-table-column>
        <el-table-column prop="message" label="摘要" min-width="260" show-overflow-tooltip />
        <el-table-column label="详情" width="90">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pager"
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        layout="total, sizes, prev, pager, next"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        @change="fetchRows"
      />
    </el-card>

    <el-drawer v-model="detailVisible" title="审计详情" size="52%">
      <el-descriptions v-if="detailData" :column="2" border>
        <el-descriptions-item label="日志ID">{{ detailData.id }}</el-descriptions-item>
        <el-descriptions-item label="时间">{{ detailData.created_at }}</el-descriptions-item>
        <el-descriptions-item label="模块">{{ detailData.module_code }}</el-descriptions-item>
        <el-descriptions-item label="动作">{{ detailData.action_type }}</el-descriptions-item>
        <el-descriptions-item label="操作人">{{ detailData.operator_name }}</el-descriptions-item>
        <el-descriptions-item label="对象">{{ detailData.biz_object_type }} / {{ detailData.biz_object_id }}</el-descriptions-item>
      </el-descriptions>

      <el-divider content-position="left">请求快照</el-divider>
      <pre class="json-box">{{ pretty(detailData?.request_summary) }}</pre>

      <el-divider content-position="left">变更前后</el-divider>
      <pre class="json-box">{{ pretty({ before: detailData?.before_snapshot, after: detailData?.after_snapshot }) }}</pre>
    </el-drawer>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }
.head { font-size: 16px; font-weight: 600; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.pager { margin-top: 12px; justify-content: flex-end; }
.json-box { margin: 0; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; max-height: 260px; overflow: auto; font-size: 12px; }
</style>
