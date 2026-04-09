<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import axios from 'axios'

interface LogRow {
  id: number
  module_code: string
  biz_object_type: string
  biz_object_id: string
  action_type: string
  operator_name: string
  result_status: string
  message: string
  created_at: string
}

const loading = ref(false)
const rows = ref<LogRow[]>([])
const total = ref(0)
const detailVisible = ref(false)
const detailData = ref<Record<string, any> | null>(null)

const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: '',
  moduleCode: '',
  actionType: '',
  resultStatus: '',
  operatorName: '',
  dateFrom: '',
  dateTo: ''
})

const fetchRows = async () => {
  loading.value = true
  try {
    const res = await axios.get('/operation-logs', { params: query })
    rows.value = Array.isArray(res.data?.data?.list) ? res.data.data.list : []
    total.value = Number(res.data?.data?.total || 0)
  } finally {
    loading.value = false
  }
}

const openDetail = async (id: number) => {
  const res = await axios.get(`/operation-logs/${id}`)
  detailData.value = res.data?.data || null
  detailVisible.value = true
}

const resetQuery = async () => {
  Object.assign(query, {
    page: 1,
    pageSize: 20,
    keyword: '',
    moduleCode: '',
    actionType: '',
    resultStatus: '',
    operatorName: '',
    dateFrom: '',
    dateTo: ''
  })
  await fetchRows()
}

onMounted(fetchRows)
</script>

<template>
  <div class="page-wrap">
    <el-card shadow="never">
      <template #header>
        <div class="header-row">
          <span class="title">操作日志中心</span>
          <el-button @click="fetchRows" :loading="loading">刷新</el-button>
        </div>
      </template>

      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="关键词/对象编码/消息" clearable style="width: 220px" />
        <el-input v-model="query.moduleCode" placeholder="模块编码" clearable style="width: 150px" />
        <el-input v-model="query.actionType" placeholder="动作类型" clearable style="width: 150px" />
        <el-select v-model="query.resultStatus" placeholder="结果" clearable style="width: 130px">
          <el-option label="成功" value="SUCCESS" />
          <el-option label="失败" value="FAILED" />
        </el-select>
        <el-input v-model="query.operatorName" placeholder="操作人" clearable style="width: 130px" />
        <el-date-picker v-model="query.dateFrom" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width: 150px" />
        <el-date-picker v-model="query.dateTo" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width: 150px" />
        <el-button type="primary" @click="query.page = 1; fetchRows()">查询</el-button>
        <el-button @click="resetQuery">重置</el-button>
      </div>

      <el-table :data="rows" border v-loading="loading">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="module_code" label="模块" width="130" />
        <el-table-column prop="action_type" label="动作" width="130" />
        <el-table-column prop="biz_object_type" label="对象类型" width="130" />
        <el-table-column prop="biz_object_id" label="对象ID" width="120" />
        <el-table-column prop="operator_name" label="操作人" width="120" />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.result_status === 'SUCCESS' ? 'success' : 'danger'">
              {{ row.result_status === 'SUCCESS' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="摘要" min-width="260" show-overflow-tooltip />
        <el-table-column prop="created_at" label="时间" width="180" />
        <el-table-column label="详情" width="90" fixed="right">
          <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row.id)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager-wrap">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          background
          layout="total, sizes, prev, pager, next"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          @change="fetchRows"
        />
      </div>
    </el-card>

    <el-drawer v-model="detailVisible" title="日志详情" size="55%">
      <template v-if="detailData">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="日志ID">{{ detailData.id }}</el-descriptions-item>
          <el-descriptions-item label="模块">{{ detailData.module_code }}</el-descriptions-item>
          <el-descriptions-item label="动作">{{ detailData.action_type }}</el-descriptions-item>
          <el-descriptions-item label="结果">{{ detailData.result_status }}</el-descriptions-item>
          <el-descriptions-item label="对象类型">{{ detailData.biz_object_type }}</el-descriptions-item>
          <el-descriptions-item label="对象ID">{{ detailData.biz_object_id }}</el-descriptions-item>
          <el-descriptions-item label="操作人">{{ detailData.operator_name }}</el-descriptions-item>
          <el-descriptions-item label="角色">{{ (detailData.operator_roles || []).join(', ') }}</el-descriptions-item>
          <el-descriptions-item label="IP">{{ detailData.operator_ip || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Trace ID">{{ detailData.trace_id || '-' }}</el-descriptions-item>
          <el-descriptions-item label="请求路径" :span="2">{{ detailData.request_method }} {{ detailData.request_path }}</el-descriptions-item>
          <el-descriptions-item label="摘要" :span="2">{{ detailData.message || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">请求快照</el-divider>
        <pre class="json-box">{{ JSON.stringify(detailData.request_summary || {}, null, 2) }}</pre>

        <el-divider content-position="left">变更前</el-divider>
        <pre class="json-box">{{ JSON.stringify(detailData.before_snapshot || {}, null, 2) }}</pre>

        <el-divider content-position="left">变更后</el-divider>
        <pre class="json-box">{{ JSON.stringify(detailData.after_snapshot || {}, null, 2) }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.page-wrap {
  padding: 20px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 16px;
  font-weight: 600;
}

.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.pager-wrap {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}

.json-box {
  margin: 0;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f8fafc;
  max-height: 220px;
  overflow: auto;
  font-size: 12px;
}
</style>
