<script setup lang="ts">
import { reactive } from 'vue'
import MdmGenericTree from '@/components/MdmGenericTree.vue'

const entityName = '组织机构'
const apiPathTree = '/master/org/tree'
const apiPath = '/master/org'

const formFields = {
  org_code: '',
  org_name: '',
  level: 1,
  parent_code: null,
  org_type: '',
  company_name: '',
  sort_order: 0,
  status: 1,
  remark: ''
}

const formRules = {
  org_code: [{ required: true, message: '组织编码必填', trigger: 'blur' }],
  org_name: [{ required: true, message: '组织名称必填', trigger: 'blur' }],
}
</script>

<template>
  <MdmGenericTree
    :entityName="entityName"
    :apiPathTree="apiPathTree"
    :apiPath="apiPath"
    nodeKey="org_code"
    labelKey="org_name"
    icon="🏢"
    :formFields="formFields"
    :formRules="formRules"
  >
    <template #columns>
      <el-table-column prop="org_code" label="组织编码" width="150">
        <template #default="{ row }"><span class="code-text">{{ row.org_code }}</span></template>
      </el-table-column>
      <el-table-column prop="org_name" label="组织名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="org_type" label="类型" width="100" />
      <el-table-column prop="parent_code" label="父级编码" width="140" />
    </template>

    <template #form="{ form, isEdit }">
      <el-form-item label="组织编码" prop="org_code">
        <el-input v-model="form.org_code" :disabled="isEdit" placeholder="如：ORG-001" />
      </el-form-item>
      <el-form-item label="组织名称" prop="org_name">
        <el-input v-model="form.org_name" />
      </el-form-item>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="组织类型"><el-input v-model="form.org_type" placeholder="如：大区" /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="父级编码"><el-input v-model="form.parent_code" :disabled="true" /></el-form-item>
        </el-col>
      </el-row>
    </template>
  </MdmGenericTree>
</template>

<style scoped>
.code-text { font-family: monospace; font-size: 12px; color: #0f6cbd; background: #eff6ff; padding: 2px 6px; border-radius: 4px; }
</style>
