<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

interface ImportTaskRow {
  id: number
  biz_type: string
  task_name: string
  file_name: string
  operator_name: string
  status: string
  total_count: number
  success_count: number
  fail_count: number
  result_message: string
  created_at: string
}

const loading = ref(false)
const rows = ref<ImportTaskRow[]>([])
const total = ref(0)
const detailVisible = ref(false)
const detailData = ref<Record<string, any> | null>(null)

const query = reactive({
  page: 1,
  pageSize: 20,
  bizType: '',
  status: '',
  keyword: ''
})

const fetchRows = async () => {
  loading.value = true
  try {
    const res = await axios.get('/import-tasks', { params: query })
    rows.value = Array.isArray(res.data?.data?.list) ? res.data.data.list : []
    total.value = Number(res.data?.data?.total || 0)
  } finally {
    loading.value = false
  }
}

const openDetail = async (id: number) => {
  const res = await axios.get(`/import-tasks/${id}`)
  detailData.value = res.data?.data || null
  detailVisible.value = true
}

const downloadErrors = async (id: number) => {
  const res = await axios.get(`/import-tasks/${id}/errors`, { responseType: 'blob' })
  const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const href = window.URL.createObjectURL(blob)
  link.href = href
  link.download = `import_task_${id}_errors.csv`
  link.click()
  window.URL.revokeObjectURL(href)
  ElMessage.success('失败明细已下载')
}

onMounted(fetchRows)
</script>

<template>
  <div class="page-wrap">
    <el-card shadow="never">
      <template #header>
        <div class="header-row">
          <span class="title">导入任务中心</span>
          <el-button @click="fetchRows" :loading="loading">刷新</el-button>
        </div>
      </template>

      <div class="toolbar">
        <el-select v-model="query.bizType" placeholder="业务类型" clearable style="width: 160px">
          <el-option label="SKU" value="SKU" />
          <el-option label="经销关系" value="RESELLER_RLTN" />
        </el-select>
        <el-select v-model="query.status" placeholder="状态" clearable style="width: 160px">
          <el-option label="成功" value="SUCCESS" />
          <el-option label="部分成功" value="PARTIAL_SUCCESS" />
          <el-option label="失败" value="FAILED" />
        </el-select>
        <el-input v-model="query.keyword" placeholder="任务名/文件名/操作人" clearable style="width: 240px" />
        <el-button type="primary" @click="query.page = 1; fetchRows()">查询</el-button>
      </div>

      <el-table :data="rows" border v-loading="loading">
        <el-table-column prop="id" label="任务ID" width="90" />
        <el-table-column prop="biz_type" label="业务类型" width="130" />
        <el-table-column prop="task_name" label="任务名称" min-width="180" />
        <el-table-column prop="file_name" label="文件名" min-width="180" show-overflow-tooltip />
        <el-table-column prop="operator_name" label="操作人" width="120" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'SUCCESS' ? 'success' : (row.status === 'PARTIAL_SUCCESS' ? 'warning' : 'danger')">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="处理统计" width="190">
          <template #default="{ row }">
            <span>总: {{ row.total_count }} 成功: {{ row.success_count }} 失败: {{ row.fail_count }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
            <el-button link type="danger" :disabled="!row.fail_count" @click="downloadErrors(row.id)">失败明细</el-button>
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

    <el-drawer v-model="detailVisible" title="导入任务详情" size="55%">
      <template v-if="detailData">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="任务ID">{{ detailData.id }}</el-descriptions-item>
          <el-descriptions-item label="业务类型">{{ detailData.biz_type }}</el-descriptions-item>
          <el-descriptions-item label="任务名">{{ detailData.task_name }}</el-descriptions-item>
          <el-descriptions-item label="文件名">{{ detailData.file_name }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ detailData.status }}</el-descriptions-item>
          <el-descriptions-item label="操作人">{{ detailData.operator_name }}</el-descriptions-item>
          <el-descriptions-item label="总条数">{{ detailData.total_count }}</el-descriptions-item>
          <el-descriptions-item label="成功数">{{ detailData.success_count }}</el-descriptions-item>
          <el-descriptions-item label="失败数">{{ detailData.fail_count }}</el-descriptions-item>
          <el-descriptions-item label="结果摘要" :span="2">{{ detailData.result_message || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">失败明细</el-divider>
        <el-table :data="detailData?.result_payload?.errors || []" border max-height="260" size="small">
          <el-table-column prop="rowNumber" label="行号" width="90" />
          <el-table-column prop="error" label="失败原因" min-width="220" />
        </el-table>
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
</style>
