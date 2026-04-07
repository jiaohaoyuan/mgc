<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, FolderAdd } from '@element-plus/icons-vue'
import axios from 'axios'

interface Props {
  entityName: string;
  apiPathTree: string;
  apiPath: string;
  nodeKey: string;
  labelKey: string;
  icon?: string;
  columns?: any[];
  formFields: any;
  formRules?: any;
}

const props = withDefaults(defineProps<Props>(), {
  icon: 'Folder',
  formRules: () => ({})
})

const loading = ref(false)
const treeData = ref<any[]>([])
const selectedNode = ref<any | null>(null)
const tableData = ref<any[]>([])

// Helper: Flatten tree for local search/filtering
const flattenTree = (nodes: any[]): any[] => {
  let result: any[] = []
  nodes.forEach(n => {
    result.push(n)
    if (n.children && n.children.length) result.push(...flattenTree(n.children))
  })
  return result
}

// Convert flat list to tree
const buildTree = (list: any[]): any[] => {
  const map: Record<string, any> = {}
  const roots: any[] = []
  list.forEach(item => { map[item[props.nodeKey]] = { ...item, children: [] } })
  list.forEach(item => {
    if (!item.parent_code) {
      roots.push(map[item[props.nodeKey]])
    } else if (map[item.parent_code]) {
      map[item.parent_code].children!.push(map[item[props.nodeKey]])
    }
  })
  return roots
}

const fetchTree = async () => {
  loading.value = true
  try {
    const res = await axios.get(props.apiPathTree)
    if (res.data.code === 200) {
      const flatList = res.data.data
      treeData.value = buildTree(flatList)
      if (!selectedNode.value) {
        tableData.value = flatList
      } else {
        // Refresh selected node's data in table
        handleNodeClick(selectedNode.value)
      }
    }
  } finally {
    loading.value = false
  }
}

const handleNodeClick = (node: any) => {
  selectedNode.value = node
  const collectCodes = (n: any): string[] => {
    const codes = [n[props.nodeKey]]
    if (n.children) n.children.forEach((c: any) => codes.push(...collectCodes(c)))
    return codes
  }
  const allCodes = new Set(collectCodes(node))
  const all = flattenTree(treeData.value)
  tableData.value = all.filter(n => allCodes.has(n[props.nodeKey]))
}

const clearSelection = () => {
  selectedNode.value = null
  fetchTree()
}

// Dialog
const dialogVisible = ref(false)
const formRef = ref()
const isEdit = ref(false)
const editId = ref<any>(null)
const form = reactive({ ...props.formFields })

const openAdd = (parentNode?: any) => {
  isEdit.value = false
  editId.value = null
  Object.assign(form, { 
    ...props.formFields, 
    level: parentNode ? (parentNode.level || 1) + 1 : 1,
    parent_code: parentNode ? parentNode[props.nodeKey] : null
  })
  dialogVisible.value = true
}

const openEdit = (row: any) => {
  isEdit.value = true
  editId.value = row.id
  Object.assign(form, row)
  dialogVisible.value = true
}

const submitForm = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const res = isEdit.value
      ? await axios.put(`${props.apiPath}/${editId.value}`, form)
      : await axios.post(props.apiPath, form)
    if (res.data.code === 200) {
      ElMessage.success(isEdit.value ? '编辑成功' : '新增成功')
      dialogVisible.value = false
      fetchTree()
    } else {
      ElMessage.error(res.data.msg)
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.msg || '操作失败')
  }
}

const handleDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确认删除【${row[props.labelKey]}】？`, '删除确认', { type: 'warning' })
    const res = await axios.delete(`${props.apiPath}/${row.id}`)
    if (res.data.code === 200) {
      ElMessage.success('删除成功')
      fetchTree()
    } else {
      ElMessage.error(res.data.msg)
    }
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.msg || '')
  }
}

onMounted(fetchTree)
</script>

<template>
  <div class="tree-page">
    <div class="page-header">
      <div class="page-title">
        <span class="title-icon">{{ icon }}</span>
        <div>
          <h2>{{ entityName }}管理</h2>
          <p class="subtitle">Master Data · {{ entityName }} Tree</p>
        </div>
      </div>
      <el-button type="primary" :icon="Plus" @click="openAdd()">新增一级{{ entityName }}</el-button>
    </div>

    <div class="tree-layout">
      <!-- Left Tree -->
      <div class="tree-panel">
        <div class="tree-header">
          {{ entityName }}结构树
          <el-button v-if="selectedNode" link type="primary" @click="clearSelection" size="small">显示全部</el-button>
        </div>
        <el-tree
          :data="treeData"
          :node-key="nodeKey"
          :props="{ label: labelKey, children: 'children' }"
          highlight-current
          default-expand-all
          @node-click="handleNodeClick"
          v-loading="loading"
        >
          <template #default="{ node, data }">
            <div class="tree-node">
              <span>{{ node.label }}</span>
              <span class="tree-node-actions">
                <el-button v-if="data.level < 3" link size="small" :icon="FolderAdd" @click.stop="openAdd(data)" />
                <el-button link size="small" :icon="Edit" @click.stop="openEdit(data)" />
              </span>
            </div>
          </template>
        </el-tree>
      </div>

      <!-- Right Table -->
      <div class="table-panel">
        <div class="table-header">
          <span v-if="selectedNode">当前节点：<b>{{ selectedNode[labelKey] }}</b></span>
          <span v-else>全部{{ entityName }}</span>
          <span class="count-badge">共 {{ tableData.length }} 条</span>
        </div>
        <el-table :data="tableData" border stripe class="sku-table">
          <slot name="columns"></slot>
          <el-table-column prop="level" label="层级" width="80" align="center">
            <template #default="{ row }">
              <el-tag size="small">{{ row.level }}级</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status ? 'success' : 'info'" size="small">{{ row.status ? '有效' : '无效' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" align="center" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.level < 3" link type="primary" size="small" @click="openAdd(row)">+子</el-button>
              <el-button link type="primary" size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" size="small" :icon="Delete" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- Dialog -->
    <el-dialog v-model="dialogVisible" :title="(isEdit ? '编辑' : '新增') + entityName" width="500px" draggable destroy-on-close class="mdm-dialog">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <slot name="form" :form="form" :isEdit="isEdit"></slot>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="层级" prop="level">
              <el-select v-model="form.level" :disabled="true" style="width:100%">
                <el-option label="一级" :value="1" />
                <el-option label="二级" :value="2" />
                <el-option label="三级" :value="3" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序" prop="sort_order">
              <el-input-number v-model="form.sort_order" :min="0" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="数据状态" prop="status">
          <el-select v-model="form.status" style="width:100%">
            <el-option label="有效" :value="1" />
            <el-option label="无效" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">{{ isEdit ? '保存修改' : '确认新增' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tree-page { padding: 20px; background: #f8fafc; min-height: calc(100vh - 60px); }
.page-header { display: flex; justify-content: space-between; align-items: center; background: #fff; border-radius: 12px; padding: 18px 24px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.page-title { display: flex; align-items: center; gap: 12px; }
.title-icon { font-size: 28px; }
.page-title h2 { font-size: 17px; font-weight: 700; color: #1e293b; margin: 0 0 2px; }
.subtitle { font-size: 12px; color: #94a3b8; margin: 0; }
.tree-layout { display: flex; gap: 16px; }
.tree-panel { width: 280px; flex-shrink: 0; background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.tree-header { font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
.tree-node { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.tree-node-actions { opacity: 0; transition: opacity .15s; }
.tree-node:hover .tree-node-actions { opacity: 1; }
.table-panel { flex: 1; background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.table-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 13px; color: #475569; }
.count-badge { background: #eff6ff; color: #3b82f6; font-size: 12px; padding: 2px 8px; border-radius: 10px; }
.sku-table { border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.mdm-dialog :deep(.el-dialog__header) { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-radius: 12px 12px 0 0; }
.mdm-dialog :deep(.el-dialog__title) { color: #fff; font-weight: 600; }
.mdm-dialog :deep(.el-dialog__headerbtn .el-dialog__close) { color: rgba(255,255,255,.8); }
</style>
