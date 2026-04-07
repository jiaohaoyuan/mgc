<script setup lang="ts">
import { reactive } from 'vue'
import MdmGenericRelation from '@/components/MdmGenericRelation.vue'

const entityName = '组织-经销商'
const apiPath = '/master/rltn/org-reseller'

const formFields = {
  org_code: '',
  reseller_code: '',
  begin_date: '',
  end_date: '',
  status: 1,
  remark: ''
}

const formRules = {
  org_code: [{ required: true, message: '组织编码必填', trigger: 'blur' }],
  reseller_code: [{ required: true, message: '经销商编码必填', trigger: 'blur' }]
}
</script>

<template>
  <MdmGenericRelation
    :entityName="entityName"
    :apiPath="apiPath"
    :formFields="formFields"
    :formRules="formRules"
    searchPlaceholder="组织/经销商编码/名称"
  >
    <template #columns>
      <el-table-column prop="org_code" label="组织编码" width="120">
        <template #default="{ row }"><span class="code-text">{{ row.org_code }}</span></template>
      </el-table-column>
      <el-table-column prop="org_name" label="组织名称" min-width="150" show-overflow-tooltip />
      <el-table-column prop="reseller_code" label="经销商编码" width="120">
        <template #default="{ row }"><span class="code-text">{{ row.reseller_code }}</span></template>
      </el-table-column>
      <el-table-column prop="reseller_name" label="经销商名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="lv1_channel_name" label="渠道名称" width="120" />
    </template>

    <template #form="{ form, isEdit }">
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="组织编码" prop="org_code">
            <el-input v-model="form.org_code" :disabled="isEdit" placeholder="如：ORG-001" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="经销商编码" prop="reseller_code">
            <el-input v-model="form.reseller_code" :disabled="isEdit" placeholder="如：RS-001" />
          </el-form-item>
        </el-col>
      </el-row>
    </template>
  </MdmGenericRelation>
</template>

<style scoped>
.code-text { font-family: monospace; font-size: 12px; color: #0f6cbd; background: #eff6ff; padding: 2px 6px; border-radius: 4px; }
</style>
