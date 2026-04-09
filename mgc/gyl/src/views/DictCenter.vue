<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import axios from 'axios'

interface DictTypeRow {
  id: number
  dict_type_code: string
  dict_type_name: string
  status: number
  sort_order: number
  remark: string
  system_flag?: number
}

interface DictItemRow {
  id: number
  dict_type_code: string
  item_code: string
  item_name: string
  item_value: string
  item_color: string
  sort_order: number
  status: number
  remark: string
  system_flag?: number
}

interface DictTypeFormModel {
  id: number
  dict_type_code: string
  dict_type_name: string
  status: number
  sort_order: number
  remark: string
}

interface DictItemFormModel {
  id: number
  dict_type_code: string
  item_code: string
  item_name: string
  item_value: string
  item_color: string
  status: number
  sort_order: number
  remark: string
}

const CODE_REGEXP = /^[A-Z][A-Z0-9_]{1,63}$/
const EL_TAG_TYPES = new Set(['success', 'warning', 'info', 'danger', 'primary'])
const colorPresets = [
  { label: '主色', value: 'primary' },
  { label: '成功', value: 'success' },
  { label: '警告', value: 'warning' },
  { label: '危险', value: 'danger' },
  { label: '信息', value: 'info' },
  { label: '#409EFF', value: '#409EFF' },
  { label: '#67C23A', value: '#67C23A' },
  { label: '#E6A23C', value: '#E6A23C' },
  { label: '#F56C6C', value: '#F56C6C' }
]

const loading = ref(false)
const activeTab = ref<'type' | 'item'>('type')
const typeRows = ref<DictTypeRow[]>([])
const itemRows = ref<DictItemRow[]>([])
const typeSelectedIds = ref<number[]>([])
const itemSelectedIds = ref<number[]>([])
const typeTableRef = ref()
const itemTableRef = ref()

const typeQuery = reactive({
  keyword: '',
  status: '' as '' | 0 | 1
})

const itemQuery = reactive({
  dictTypeCode: '',
  keyword: '',
  status: '' as '' | 0 | 1
})

const typeDialogVisible = ref(false)
const typeEditMode = ref(false)
const typeFormRef = ref<FormInstance>()
const typeForm = reactive<DictTypeFormModel>({
  id: 0,
  dict_type_code: '',
  dict_type_name: '',
  status: 1,
  sort_order: 1,
  remark: ''
})

const itemDialogVisible = ref(false)
const itemEditMode = ref(false)
const itemFormRef = ref<FormInstance>()
const itemForm = reactive<DictItemFormModel>({
  id: 0,
  dict_type_code: '',
  item_code: '',
  item_name: '',
  item_value: '',
  item_color: '',
  sort_order: 1,
  status: 1,
  remark: ''
})

const typeRules: FormRules<DictTypeFormModel> = {
  dict_type_code: [
    { required: true, message: '请输入类型编码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (!CODE_REGEXP.test(String(value || ''))) {
          callback(new Error('编码仅支持大写字母、数字、下划线，且必须字母开头'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  dict_type_name: [{ required: true, message: '请输入类型名称', trigger: 'blur' }]
}

const itemRules: FormRules<DictItemFormModel> = {
  dict_type_code: [{ required: true, message: '请选择字典类型', trigger: 'change' }],
  item_code: [
    { required: true, message: '请输入项编码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (!CODE_REGEXP.test(String(value || ''))) {
          callback(new Error('编码仅支持大写字母、数字、下划线，且必须字母开头'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  item_name: [{ required: true, message: '请输入项名称', trigger: 'blur' }]
}

const typeOptions = computed(() =>
  typeRows.value.map((row) => ({
    label: `${row.dict_type_name} (${row.dict_type_code})`,
    value: row.dict_type_code
  }))
)

const normalizeCodeInput = (value: string) => String(value || '').trim().replace(/\s+/g, '_').toUpperCase()
const isHexColor = (value: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)

const getTagType = (color: string): '' | 'success' | 'warning' | 'info' | 'danger' | 'primary' => {
  const normalized = String(color || '').trim()
  if (EL_TAG_TYPES.has(normalized)) return normalized as 'success' | 'warning' | 'info' | 'danger' | 'primary'
  return ''
}

const getTagStyle = (color: string) => {
  const normalized = String(color || '').trim()
  if (!isHexColor(normalized)) return {}
  return {
    color: normalized,
    borderColor: normalized,
    backgroundColor: `${normalized}1A`
  }
}

const clearTypeSelection = () => {
  typeSelectedIds.value = []
  nextTick(() => typeTableRef.value?.clearSelection?.())
}

const clearItemSelection = () => {
  itemSelectedIds.value = []
  nextTick(() => itemTableRef.value?.clearSelection?.())
}

const fetchTypeRows = async () => {
  loading.value = true
  try {
    const res = await axios.get('/dict/types', { params: typeQuery })
    typeRows.value = Array.isArray(res.data?.data) ? res.data.data : []
    if (itemQuery.dictTypeCode && !typeRows.value.some((row) => row.dict_type_code === itemQuery.dictTypeCode)) {
      itemQuery.dictTypeCode = ''
    }
    clearTypeSelection()
  } finally {
    loading.value = false
  }
}

const fetchItemRows = async () => {
  loading.value = true
  try {
    const res = await axios.get('/dict/items', {
      params: {
        dictTypeCode: itemQuery.dictTypeCode,
        keyword: itemQuery.keyword,
        status: itemQuery.status
      }
    })
    itemRows.value = Array.isArray(res.data?.data) ? res.data.data : []
    clearItemSelection()
  } finally {
    loading.value = false
  }
}

const refreshActiveTab = async () => {
  if (activeTab.value === 'type') {
    await fetchTypeRows()
    return
  }
  if (!typeRows.value.length) {
    await fetchTypeRows()
  }
  if (!itemQuery.dictTypeCode && typeRows.value.length) {
    itemQuery.dictTypeCode = typeRows.value[0]?.dict_type_code || ''
  }
  await fetchItemRows()
}

const onTypeSelectionChange = (rows: DictTypeRow[]) => {
  typeSelectedIds.value = rows.map((row) => row.id)
}

const onItemSelectionChange = (rows: DictItemRow[]) => {
  itemSelectedIds.value = rows.map((row) => row.id)
}

const normalizeTypeFormCode = () => {
  typeForm.dict_type_code = normalizeCodeInput(typeForm.dict_type_code)
}

const normalizeItemFormCode = () => {
  itemForm.item_code = normalizeCodeInput(itemForm.item_code)
}

const openTypeCreate = () => {
  typeEditMode.value = false
  Object.assign(typeForm, {
    id: 0,
    dict_type_code: '',
    dict_type_name: '',
    status: 1,
    sort_order: Math.max(1, typeRows.value.length + 1),
    remark: ''
  })
  typeDialogVisible.value = true
  nextTick(() => typeFormRef.value?.clearValidate())
}

const openTypeEdit = (row: DictTypeRow) => {
  typeEditMode.value = true
  Object.assign(typeForm, {
    id: row.id,
    dict_type_code: row.dict_type_code,
    dict_type_name: row.dict_type_name,
    status: row.status,
    sort_order: row.sort_order,
    remark: row.remark || ''
  })
  typeDialogVisible.value = true
  nextTick(() => typeFormRef.value?.clearValidate())
}

const submitType = async () => {
  normalizeTypeFormCode()
  await typeFormRef.value?.validate()
  const payload = {
    dict_type_code: typeForm.dict_type_code,
    dict_type_name: typeForm.dict_type_name.trim(),
    status: typeForm.status,
    sort_order: typeForm.sort_order,
    remark: typeForm.remark
  }
  if (typeEditMode.value) {
    await axios.put(`/dict/types/${typeForm.id}`, payload)
  } else {
    await axios.post('/dict/types', payload)
  }
  ElMessage.success(typeEditMode.value ? '更新成功' : '新增成功')
  typeDialogVisible.value = false
  await fetchTypeRows()
}

const removeType = async (row: DictTypeRow) => {
  await ElMessageBox.confirm(`确认删除字典类型 ${row.dict_type_name} 吗？`, '删除确认', { type: 'warning' })
  await axios.delete(`/dict/types/${row.id}`)
  ElMessage.success('删除成功')
  await fetchTypeRows()
}

const batchUpdateTypeStatus = async (status: 0 | 1) => {
  if (!typeSelectedIds.value.length) {
    ElMessage.warning('请先选择要操作的字典类型')
    return
  }
  const actionText = status === 1 ? '启用' : '停用'
  await ElMessageBox.confirm(`确认批量${actionText}已选 ${typeSelectedIds.value.length} 条字典类型吗？`, '批量操作确认', {
    type: 'warning'
  })
  const res = await axios.patch('/dict/types/batch-status', {
    ids: typeSelectedIds.value,
    status
  })
  const updatedCount = Number(res.data?.data?.updatedCount || 0)
  const skippedCount = Number(res.data?.data?.skippedCount || 0)
  ElMessage.success(`批量${actionText}完成：成功${updatedCount}条，跳过${skippedCount}条`)
  await fetchTypeRows()
}

const openItemCreate = async () => {
  if (!typeRows.value.length) {
    await fetchTypeRows()
  }
  itemEditMode.value = false
  Object.assign(itemForm, {
    id: 0,
    dict_type_code: itemQuery.dictTypeCode || (typeRows.value[0]?.dict_type_code || ''),
    item_code: '',
    item_name: '',
    item_value: '',
    item_color: '',
    sort_order: Math.max(1, itemRows.value.length + 1),
    status: 1,
    remark: ''
  })
  itemDialogVisible.value = true
  nextTick(() => itemFormRef.value?.clearValidate())
}

const openItemEdit = (row: DictItemRow) => {
  itemEditMode.value = true
  Object.assign(itemForm, {
    id: row.id,
    dict_type_code: row.dict_type_code,
    item_code: row.item_code,
    item_name: row.item_name,
    item_value: row.item_value,
    item_color: row.item_color || '',
    sort_order: row.sort_order,
    status: row.status,
    remark: row.remark || ''
  })
  itemDialogVisible.value = true
  nextTick(() => itemFormRef.value?.clearValidate())
}

const submitItem = async () => {
  normalizeItemFormCode()
  await itemFormRef.value?.validate()
  const payload = {
    dict_type_code: itemForm.dict_type_code,
    item_code: itemForm.item_code,
    item_name: itemForm.item_name.trim(),
    item_value: itemForm.item_value ? itemForm.item_value.trim() : itemForm.item_code,
    item_color: itemForm.item_color.trim(),
    sort_order: itemForm.sort_order,
    status: itemForm.status,
    remark: itemForm.remark
  }
  if (itemEditMode.value) {
    await axios.put(`/dict/items/${itemForm.id}`, payload)
  } else {
    await axios.post('/dict/items', payload)
  }
  ElMessage.success(itemEditMode.value ? '更新成功' : '新增成功')
  itemDialogVisible.value = false
  await fetchItemRows()
}

const removeItem = async (row: DictItemRow) => {
  await ElMessageBox.confirm(`确认删除字典项 ${row.item_name} 吗？`, '删除确认', { type: 'warning' })
  await axios.delete(`/dict/items/${row.id}`)
  ElMessage.success('删除成功')
  await fetchItemRows()
}

const batchUpdateItemStatus = async (status: 0 | 1) => {
  if (!itemSelectedIds.value.length) {
    ElMessage.warning('请先选择要操作的字典项')
    return
  }
  const actionText = status === 1 ? '启用' : '停用'
  await ElMessageBox.confirm(`确认批量${actionText}已选 ${itemSelectedIds.value.length} 条字典项吗？`, '批量操作确认', {
    type: 'warning'
  })
  const res = await axios.patch('/dict/items/batch-status', {
    ids: itemSelectedIds.value,
    status
  })
  const updatedCount = Number(res.data?.data?.updatedCount || 0)
  const skippedCount = Number(res.data?.data?.skippedCount || 0)
  ElMessage.success(`批量${actionText}完成：成功${updatedCount}条，跳过${skippedCount}条`)
  await fetchItemRows()
}

const applyColorPreset = (value: string) => {
  itemForm.item_color = value
}

onMounted(async () => {
  await fetchTypeRows()
})
</script>

<template>
  <div class="page-wrap">
    <el-card shadow="never">
      <template #header>
        <div class="header-row">
          <span class="title">字典中心</span>
          <el-button :loading="loading" @click="refreshActiveTab">刷新</el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab" @tab-change="refreshActiveTab">
        <el-tab-pane label="字典类型" name="type">
          <div class="toolbar">
            <el-input v-model="typeQuery.keyword" placeholder="类型编码/名称" clearable style="width: 260px" />
            <el-select v-model="typeQuery.status" placeholder="状态" clearable style="width: 140px">
              <el-option label="启用" :value="1" />
              <el-option label="停用" :value="0" />
            </el-select>
            <el-button type="primary" @click="fetchTypeRows">查询</el-button>
            <el-button @click="openTypeCreate">新增类型</el-button>
            <el-button type="success" plain :disabled="!typeSelectedIds.length" @click="batchUpdateTypeStatus(1)">批量启用</el-button>
            <el-button type="warning" plain :disabled="!typeSelectedIds.length" @click="batchUpdateTypeStatus(0)">批量停用</el-button>
          </div>

          <el-table ref="typeTableRef" :data="typeRows" border row-key="id" v-loading="loading" @selection-change="onTypeSelectionChange">
            <el-table-column type="selection" width="48" />
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="dict_type_code" label="类型编码" min-width="180" />
            <el-table-column prop="dict_type_name" label="类型名称" min-width="180" />
            <el-table-column prop="sort_order" label="排序" width="90" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="内置" width="90">
              <template #default="{ row }">
                <el-tag :type="row.system_flag ? 'warning' : 'info'">{{ row.system_flag ? '是' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="200" />
            <el-table-column label="操作" width="180" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openTypeEdit(row)">编辑</el-button>
                <el-button link type="danger" :disabled="Boolean(row.system_flag)" @click="removeType(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="字典项" name="item">
          <div class="toolbar">
            <el-select v-model="itemQuery.dictTypeCode" placeholder="字典类型" clearable style="width: 220px">
              <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <el-input v-model="itemQuery.keyword" placeholder="项编码/项名称/项值" clearable style="width: 260px" />
            <el-select v-model="itemQuery.status" placeholder="状态" clearable style="width: 140px">
              <el-option label="启用" :value="1" />
              <el-option label="停用" :value="0" />
            </el-select>
            <el-button type="primary" @click="fetchItemRows">查询</el-button>
            <el-button @click="openItemCreate">新增字典项</el-button>
            <el-button type="success" plain :disabled="!itemSelectedIds.length" @click="batchUpdateItemStatus(1)">批量启用</el-button>
            <el-button type="warning" plain :disabled="!itemSelectedIds.length" @click="batchUpdateItemStatus(0)">批量停用</el-button>
          </div>

          <el-table ref="itemTableRef" :data="itemRows" border row-key="id" v-loading="loading" @selection-change="onItemSelectionChange">
            <el-table-column type="selection" width="48" />
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="dict_type_code" label="类型编码" min-width="160" />
            <el-table-column prop="item_code" label="项编码" min-width="150" />
            <el-table-column prop="item_name" label="项名称" min-width="160" />
            <el-table-column prop="item_value" label="项值" min-width="140" />
            <el-table-column label="颜色" width="140">
              <template #default="{ row }">
                <el-tag v-if="row.item_color" :type="getTagType(row.item_color)" :style="getTagStyle(row.item_color)" effect="plain">
                  {{ row.item_color }}
                </el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="sort_order" label="排序" width="90" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="内置" width="90">
              <template #default="{ row }">
                <el-tag :type="row.system_flag ? 'warning' : 'info'">{{ row.system_flag ? '是' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="180" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openItemEdit(row)">编辑</el-button>
                <el-button link type="danger" :disabled="Boolean(row.system_flag)" @click="removeItem(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="typeDialogVisible" :title="typeEditMode ? '编辑字典类型' : '新增字典类型'" width="580px">
      <el-form ref="typeFormRef" :model="typeForm" :rules="typeRules" label-width="100px">
        <el-form-item label="类型编码" prop="dict_type_code">
          <el-input
            v-model="typeForm.dict_type_code"
            :disabled="typeEditMode"
            maxlength="64"
            placeholder="如 ORDER_STATUS"
            @blur="normalizeTypeFormCode"
          />
          <div class="form-tip">仅支持大写字母、数字、下划线，且必须字母开头</div>
        </el-form-item>
        <el-form-item label="类型名称" prop="dict_type_name">
          <el-input v-model="typeForm.dict_type_name" maxlength="64" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="typeForm.sort_order" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="typeForm.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="typeForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="typeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitType">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="itemDialogVisible" :title="itemEditMode ? '编辑字典项' : '新增字典项'" width="680px">
      <el-form ref="itemFormRef" :model="itemForm" :rules="itemRules" label-width="100px">
        <el-form-item label="字典类型" prop="dict_type_code">
          <el-select v-model="itemForm.dict_type_code" placeholder="请选择类型" style="width: 100%">
            <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="项编码" prop="item_code">
          <el-input
            v-model="itemForm.item_code"
            :disabled="itemEditMode"
            maxlength="64"
            placeholder="如 ENABLED"
            @blur="normalizeItemFormCode"
          />
          <div class="form-tip">仅支持大写字母、数字、下划线，且必须字母开头</div>
        </el-form-item>
        <el-form-item label="项名称" prop="item_name">
          <el-input v-model="itemForm.item_name" maxlength="64" />
        </el-form-item>
        <el-form-item label="项值">
          <el-input v-model="itemForm.item_value" maxlength="128" placeholder="为空时默认使用项编码" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-input v-model="itemForm.item_color" maxlength="20" placeholder="例如 success / warning / #409EFF" />
          <div class="color-presets">
            <el-tag
              v-for="preset in colorPresets"
              :key="preset.value"
              class="color-preset-tag"
              :type="getTagType(preset.value)"
              :style="getTagStyle(preset.value)"
              effect="plain"
              @click="applyColorPreset(preset.value)"
            >
              {{ preset.label }}
            </el-tag>
          </div>
          <div v-if="itemForm.item_color" class="color-preview">
            <span>预览：</span>
            <el-tag :type="getTagType(itemForm.item_color)" :style="getTagStyle(itemForm.item_color)" effect="plain">示例标签</el-tag>
          </div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="itemForm.sort_order" :min="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="itemForm.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="itemForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitItem">保存</el-button>
      </template>
    </el-dialog>
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
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.form-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.2;
}

.color-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.color-preset-tag {
  cursor: pointer;
}

.color-preview {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;
}
</style>
