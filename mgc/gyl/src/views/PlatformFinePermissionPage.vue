<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const pretty = (value: unknown) => JSON.stringify(value ?? {}, null, 2)
const roleRows = ref<any[]>([])
const rows = ref<any[]>([])
const query = reactive({
  roleId: '',
  modulePath: ''
})
const editVisible = ref(false)
const form = reactive({
  id: 0,
  buttonCodes: '',
  dataScopeType: 'ALL',
  dataScopeConfigText: '{}',
  fieldPermissionsText: '[]'
})

const fetchRows = async () => {
  const params: Record<string, string> = {}
  if (query.roleId) params.roleId = query.roleId
  if (query.modulePath) params.modulePath = query.modulePath
  const [{ data: fine }, { data: roles }] = await Promise.all([
    axios.get('/platform/fine-permissions', { params }),
    axios.get('/roles')
  ])
  rows.value = fine?.data || []
  roleRows.value = roles?.data || []
}

const openEdit = (row: any) => {
  form.id = Number(row.id)
  form.buttonCodes = (row.button_codes || []).join(',')
  form.dataScopeType = String(row.data_scope_type || 'ALL')
  form.dataScopeConfigText = pretty(row.data_scope_config || {})
  form.fieldPermissionsText = pretty(row.field_permissions || [])
  editVisible.value = true
}

const saveEdit = async () => {
  let dataScopeConfig: unknown = {}
  let fieldPermissions: unknown = []
  try {
    dataScopeConfig = JSON.parse(form.dataScopeConfigText || '{}')
  } catch {
    ElMessage.error('数据范围配置必须是合法 JSON')
    return
  }
  try {
    fieldPermissions = JSON.parse(form.fieldPermissionsText || '[]')
  } catch {
    ElMessage.error('字段权限必须是合法 JSON 数组')
    return
  }
  await axios.put(`/platform/fine-permissions/${form.id}`, {
    buttonCodes: form.buttonCodes,
    dataScopeType: form.dataScopeType,
    dataScopeConfig,
    fieldPermissions
  })
  editVisible.value = false
  await fetchRows()
}

onMounted(fetchRows)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="head">权限精细化控制</div>
      </template>

      <div class="toolbar">
        <el-select v-model="query.roleId" clearable placeholder="角色" style="width: 220px">
          <el-option v-for="role in roleRows" :key="role.id" :label="role.name" :value="String(role.id)" />
        </el-select>
        <el-input v-model="query.modulePath" clearable placeholder="模块路径(如 /platform/audit-log)" style="width: 280px" />
        <el-button type="primary" @click="fetchRows">查询</el-button>
      </div>

      <el-table :data="rows" border>
        <el-table-column prop="role_name" label="角色" width="180" />
        <el-table-column prop="module_name" label="模块" min-width="180" />
        <el-table-column prop="module_path" label="路径" min-width="240" />
        <el-table-column label="按钮权限" min-width="220">
          <template #default="{ row }">{{ (row.button_codes || []).join(', ') || '-' }}</template>
        </el-table-column>
        <el-table-column prop="data_scope_type" label="数据范围" width="130" />
        <el-table-column label="字段权限" min-width="220">
          <template #default="{ row }">{{ (row.field_permissions || []).length }} 项</template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="editVisible" title="编辑精细权限" width="760px">
      <el-form label-width="130px">
        <el-form-item label="按钮权限">
          <el-input v-model="form.buttonCodes" placeholder="多个按钮编码用逗号分隔" />
        </el-form-item>
        <el-form-item label="数据范围">
          <el-select v-model="form.dataScopeType" style="width: 180px">
            <el-option label="全部数据" value="ALL" />
            <el-option label="本部门" value="DEPT" />
            <el-option label="部门及下级" value="DEPT_AND_CHILD" />
            <el-option label="仅本人" value="SELF" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据范围配置(JSON)">
          <el-input v-model="form.dataScopeConfigText" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="字段权限(JSON数组)">
          <el-input v-model="form.fieldPermissionsText" type="textarea" :rows="6" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }
.head { font-size: 16px; font-weight: 600; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
</style>
