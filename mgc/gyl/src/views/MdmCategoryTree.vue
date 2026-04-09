<script setup lang="ts">
import { reactive } from 'vue'
import MdmGenericTree from '@/components/MdmGenericTree.vue'

const entityName = '品类'
const apiPathTree = '/master/category/tree'
const apiPath = '/master/category'

const formFields = {
  category_code: '',
  category_name: '',
  level: 1,
  parent_code: null,
  sort_order: 0,
  status: 1,
  remark: ''
}

const formRules = {
  category_code: [{ required: true, message: '品类编码必填', trigger: 'blur' }],
  category_name: [{ required: true, message: '品类名称必填', trigger: 'blur' }],
  level: [{ required: true, message: '层级必填', trigger: 'change' }]
}
</script>

<template>
  <MdmGenericTree
    :entityName="entityName"
    :apiPathTree="apiPathTree"
    :apiPath="apiPath"
    nodeKey="category_code"
    labelKey="category_name"
    icon="🏷️"
    :formFields="formFields"
    :formRules="formRules"
  >
    <template #columns>
      <el-table-column prop="category_code" label="品类编码" width="150">
        <template #default="{ row }"><span class="code-text">{{ row.category_code }}</span></template>
      </el-table-column>
      <el-table-column prop="category_name" label="品类名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="parent_code" label="父级编码" width="140" />
      <el-table-column prop="sort_order" label="排序" width="70" align="right" />
    </template>

    <template #form="{ form, isEdit }">
      <el-form-item label="品类编码" prop="category_code">
          <el-input v-model="form.category_code" :disabled="isEdit" placeholder="例如：CAT-L3-001" />
      </el-form-item>
      <el-form-item label="品类名称" prop="category_name">
        <el-input v-model="form.category_name" placeholder="如：低温鲜奶" />
      </el-form-item>
      <el-form-item label="父级编码" prop="parent_code">
        <el-input v-model="form.parent_code" :disabled="true" placeholder="自动带入" />
      </el-form-item>
    </template>
  </MdmGenericTree>
</template>

<style scoped>
.code-text { font-family: monospace; font-size: 12px; color: #0f6cbd; background: #eff6ff; padding: 2px 6px; border-radius: 4px; }
</style>
