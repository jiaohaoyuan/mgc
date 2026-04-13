<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const policyRows = ref<any[]>([])
const jobRows = ref<any[]>([])
const jobTotal = ref(0)
const jobQuery = reactive({
  page: 1,
  pageSize: 10
})

const fetchData = async () => {
  const [{ data: policy }, { data: jobs }] = await Promise.all([
    axios.get('/platform/archive/policies'),
    axios.get('/platform/archive/jobs', { params: jobQuery })
  ])
  policyRows.value = policy?.data || []
  jobRows.value = jobs?.data?.list || []
  jobTotal.value = Number(jobs?.data?.total || 0)
}

const savePolicy = async (row: any) => {
  await axios.put(`/platform/archive/policies/${row.id}`, {
    retentionDays: row.retention_days,
    status: row.status
  })
  ElMessage.success('策略已更新')
}

const runPolicy = async (row: any) => {
  await axios.post('/platform/archive/run', { policyCode: row.policy_code })
  ElMessage.success('归档执行成功')
  await fetchData()
}

onMounted(fetchData)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="head">数据归档策略</div>
      </template>

      <el-table :data="policyRows" border>
        <el-table-column prop="policy_code" label="策略编码" width="160" />
        <el-table-column prop="policy_name" label="策略名称" min-width="180" />
        <el-table-column prop="target_type" label="归档对象" width="140" />
        <el-table-column label="保留天数" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.retention_days" :min="1" :max="3650" />
          </template>
        </el-table-column>
        <el-table-column label="启停" width="110">
          <template #default="{ row }">
            <el-switch v-model="row.status" :active-value="1" :inactive-value="0" />
          </template>
        </el-table-column>
        <el-table-column prop="last_run_at" label="最近执行时间" min-width="170" />
        <el-table-column label="操作" width="170">
          <template #default="{ row }">
            <el-button link type="primary" @click="savePolicy(row)">保存</el-button>
            <el-button link type="warning" @click="runPolicy(row)">执行</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="head">归档任务记录</div>
      </template>

      <el-table :data="jobRows" border>
        <el-table-column prop="id" label="任务ID" width="90" />
        <el-table-column prop="policy_code" label="策略编码" width="150" />
        <el-table-column prop="target_type" label="对象类型" width="130" />
        <el-table-column prop="archived_count" label="归档数量" width="110" />
        <el-table-column prop="status" label="状态" width="100" />
        <el-table-column prop="operator_name" label="执行人" width="120" />
        <el-table-column prop="started_at" label="开始时间" min-width="170" />
        <el-table-column prop="finished_at" label="结束时间" min-width="170" />
      </el-table>

      <el-pagination
        class="pager"
        v-model:current-page="jobQuery.page"
        v-model:page-size="jobQuery.pageSize"
        layout="total, sizes, prev, pager, next"
        :total="jobTotal"
        :page-sizes="[10, 20, 50]"
        @change="fetchData"
      />
    </el-card>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }
.head { font-size: 16px; font-weight: 600; }
.pager { margin-top: 12px; justify-content: flex-end; }
</style>
