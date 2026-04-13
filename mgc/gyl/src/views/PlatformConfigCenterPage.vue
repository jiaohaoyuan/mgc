<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const pretty = (value: unknown) => JSON.stringify(value ?? {}, null, 2)
const rows = ref<any[]>([])
const editVisible = ref(false)
const versionVisible = ref(false)
const versions = ref<any[]>([])
const form = reactive({
  code: '',
  valueText: '{}',
  status: 1,
  note: ''
})

const fetchRows = async () => {
  const { data } = await axios.get('/platform/system-configs')
  rows.value = data?.data || []
}

const openEdit = (row: any) => {
  form.code = row.config_code
  form.valueText = pretty(row.config_value)
  form.status = Number(row.status ?? 1)
  form.note = ''
  editVisible.value = true
}

const saveEdit = async () => {
  let value: unknown = {}
  try {
    value = JSON.parse(form.valueText || '{}')
  } catch {
    ElMessage.error('配置值必须是合法 JSON')
    return
  }
  await axios.put(`/platform/system-configs/${form.code}`, {
    configValue: value,
    status: form.status,
    changeNote: form.note || '控制台更新'
  })
  editVisible.value = false
  await fetchRows()
}

const openVersions = async (row: any) => {
  const { data } = await axios.get(`/platform/system-configs/${row.config_code}/versions`)
  versions.value = data?.data || []
  versionVisible.value = true
}

onMounted(fetchRows)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="head">系统配置中心</div>
      </template>

      <el-table :data="rows" border>
        <el-table-column prop="config_code" label="配置编码" min-width="170" />
        <el-table-column prop="config_name" label="配置名称" min-width="170" />
        <el-table-column prop="config_type" label="配置类型" min-width="170" />
        <el-table-column prop="version" label="版本" width="90" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="Number(row.status) === 1 ? 'success' : 'info'">
              {{ Number(row.status) === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updated_by" label="更新人" width="120" />
        <el-table-column prop="updated_at" label="更新时间" min-width="170" />
        <el-table-column label="操作" width="170">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link @click="openVersions(row)">版本</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="editVisible" title="编辑配置" width="760px">
      <el-form label-width="110px">
        <el-form-item label="配置编码">{{ form.code }}</el-form-item>
        <el-form-item label="配置值(JSON)">
          <el-input v-model="form.valueText" type="textarea" :rows="10" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="变更说明">
          <el-input v-model="form.note" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="versionVisible" title="配置版本记录" size="48%">
      <el-table :data="versions" border>
        <el-table-column prop="version" label="版本" width="90" />
        <el-table-column prop="status" label="状态" width="90" />
        <el-table-column prop="changed_by" label="变更人" width="120" />
        <el-table-column prop="change_note" label="说明" min-width="220" />
        <el-table-column prop="changed_at" label="时间" min-width="170" />
      </el-table>
    </el-drawer>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; }
.head { font-size: 16px; font-weight: 600; }
</style>
