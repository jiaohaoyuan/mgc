<script setup lang="ts">
import { reactive } from 'vue'
import MdmGenericTree from '@/components/MdmGenericTree.vue'

const entityName = '渠道'
const apiPathTree = '/master/channel/tree'
const apiPath = '/master/channel'

const formFields = {
  channel_code: '',
  channel_name: '',
  level: 1,
  parent_code: null,
  sort_order: 0,
  status: 1,
  remark: ''
}

const formRules = {
  channel_code: [{ required: true, message: '渠道编码必填', trigger: 'blur' }],
  channel_name: [{ required: true, message: '渠道名称必填', trigger: 'blur' }],
}
</script>

<template>
  <MdmGenericTree
    :entityName="entityName"
    :apiPathTree="apiPathTree"
    :apiPath="apiPath"
    nodeKey="channel_code"
    labelKey="channel_name"
    icon="📡"
    :formFields="formFields"
    :formRules="formRules"
  >
    <template #columns>
      <el-table-column prop="channel_code" label="渠道编码" width="150">
        <template #default="{ row }"><span class="code-text">{{ row.channel_code }}</span></template>
      </el-table-column>
      <el-table-column prop="channel_name" label="渠道名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="parent_code" label="父级编码" width="140" />
      <el-table-column prop="sort_order" label="排序" width="70" align="right" />
    </template>

    <template #form="{ form, isEdit }">
      <el-form-item label="渠道编码" prop="channel_code">
        <el-input v-model="form.channel_code" :disabled="isEdit" placeholder="如：CH-L1-001" />
      </el-form-item>
      <el-form-item label="渠道名称" prop="channel_name">
        <el-input v-model="form.channel_name" placeholder="如：线上渠道" />
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
