<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import axios from 'axios'

const query = reactive({
  page: 1,
  pageSize: 20,
  eventType: '',
  result: '',
  riskLevel: '',
  username: ''
})
const rows = ref<any[]>([])
const total = ref(0)
const summary = reactive({
  loginSuccess: 0,
  loginFailed: 0,
  passwordResetCount: 0,
  permissionChangeCount: 0,
  abnormalLoginCount: 0
})

const fetchAll = async () => {
  const [{ data: list }, { data: sum }] = await Promise.all([
    axios.get('/platform/security/logs', { params: query }),
    axios.get('/platform/security/summary')
  ])
  rows.value = list?.data?.list || []
  total.value = Number(list?.data?.total || 0)
  Object.assign(summary, sum?.data || {})
}

onMounted(fetchAll)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="head">登录日志与安全中心</div>
      </template>

      <div class="summary">
        <span>登录成功 {{ summary.loginSuccess }}</span>
        <span>登录失败 {{ summary.loginFailed }}</span>
        <span>密码重置 {{ summary.passwordResetCount }}</span>
        <span>权限变更 {{ summary.permissionChangeCount }}</span>
        <span>异常登录 {{ summary.abnormalLoginCount }}</span>
      </div>

      <div class="toolbar">
        <el-select v-model="query.eventType" clearable placeholder="事件类型" style="width: 150px">
          <el-option label="登录" value="LOGIN" />
          <el-option label="密码重置" value="PASSWORD_RESET" />
          <el-option label="权限变更" value="PERMISSION_CHANGE" />
        </el-select>
        <el-select v-model="query.result" clearable placeholder="结果" style="width: 120px">
          <el-option label="成功" value="SUCCESS" />
          <el-option label="失败" value="FAILED" />
        </el-select>
        <el-select v-model="query.riskLevel" clearable placeholder="风险" style="width: 120px">
          <el-option label="LOW" value="LOW" />
          <el-option label="MEDIUM" value="MEDIUM" />
          <el-option label="HIGH" value="HIGH" />
          <el-option label="CRITICAL" value="CRITICAL" />
        </el-select>
        <el-input v-model="query.username" clearable placeholder="用户名" style="width: 170px" />
        <el-button type="primary" @click="query.page = 1; fetchAll()">查询</el-button>
      </div>

      <el-table :data="rows" border>
        <el-table-column prop="created_at" label="时间" min-width="170" />
        <el-table-column prop="event_type" label="事件类型" width="160" />
        <el-table-column prop="username" label="用户名" width="140" />
        <el-table-column prop="result" label="结果" width="100" />
        <el-table-column prop="risk_level" label="风险级别" width="120" />
        <el-table-column prop="operator_ip" label="IP" min-width="140" />
        <el-table-column prop="message" label="说明" min-width="260" show-overflow-tooltip />
      </el-table>

      <el-pagination
        class="pager"
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        layout="total, sizes, prev, pager, next"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        @change="fetchAll"
      />
    </el-card>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }
.head { font-size: 16px; font-weight: 600; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.summary { display: flex; gap: 18px; margin-bottom: 12px; color: #475569; font-size: 13px; flex-wrap: wrap; }
.pager { margin-top: 12px; justify-content: flex-end; }
</style>
