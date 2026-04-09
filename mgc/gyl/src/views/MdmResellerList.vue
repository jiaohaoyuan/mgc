<script setup lang="ts">
import { reactive } from 'vue'
import MdmGenericList from '@/components/MdmGenericList.vue'

const entityName = '经销商'
const apiPath = '/master/reseller'

const formFields = {
  reseller_code: '',
  reseller_name: '',
  is_own: 0,
  lv1_channel_code: '',
  lv1_channel_name: '',
  lv2_channel_code: '',
  lv2_channel_name: '',
  lv3_channel_code: '',
  lv3_channel_name: '',
  sale_region_name: '',
  default_warehouse_code: '',
  contract_type: '',
  contract_begin_date: '',
  contract_end_date: '',
  province_name: '',
  city_name: '',
  district_name: '',
  status: 1,
  remark: ''
}

const formRules = {
  reseller_code: [{ required: true, message: '经销商编码必填', trigger: 'blur' }],
  reseller_name: [{ required: true, message: '经销商名称必填', trigger: 'blur' }]
}
</script>

<template>
  <MdmGenericList
    :entityName="entityName"
    :apiPath="apiPath"
    :formFields="formFields"
    :formRules="formRules"
    searchPlaceholder="经销商编码/名称"
  >
    <template #filters="{ queryParams }">
      <el-form-item label="渠道编码">
        <el-input v-model="queryParams.lv1ChannelCode" placeholder="一级渠道编码" clearable style="width:130px" />
      </el-form-item>
      <el-form-item label="是否自营">
        <el-select v-model="queryParams.isOwn" placeholder="全部" clearable style="width:100px">
          <el-option label="自营" value="1" />
          <el-option label="他营" value="0" />
        </el-select>
      </el-form-item>
    </template>

    <template #columns>
      <el-table-column prop="reseller_code" label="经销商编码" width="130" fixed="left">
        <template #default="{ row }"><span class="code-text">{{ row.reseller_code }}</span></template>
      </el-table-column>
      <el-table-column prop="reseller_name" label="经销商名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="is_own" label="性质" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.is_own ? 'success' : 'info'" size="small">{{ row.is_own ? '自营' : '他营' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="lv3_channel_name" label="三级渠道" width="120" show-overflow-tooltip />
      <el-table-column prop="sale_region_name" label="销售大区" width="100" />
      <el-table-column prop="default_warehouse_name" label="默认出库仓" width="150" show-overflow-tooltip />
      <el-table-column label="位置" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          {{ [row.province_name, row.city_name].filter(Boolean).join(' ') || '-' }}
        </template>
      </el-table-column>
    </template>

    <template #form="{ form, isEdit }">
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="经销商编码" prop="reseller_code">
          <el-input v-model="form.reseller_code" :disabled="isEdit" placeholder="例如：RS-001" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="经销商名称" prop="reseller_name">
            <el-input v-model="form.reseller_name" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="一级渠道" prop="lv1_channel_name"><el-input v-model="form.lv1_channel_name" /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="三级渠道" prop="lv3_channel_name"><el-input v-model="form.lv3_channel_name" /></el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="性质" prop="is_own">
            <el-select v-model="form.is_own" style="width: 100%">
              <el-option label="自营" :value="1" />
              <el-option label="他营" :value="0" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="销售区域" prop="sale_region_name"><el-input v-model="form.sale_region_name" /></el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12"><el-form-item label="省份" prop="province_name"><el-input v-model="form.province_name" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="城市" prop="city_name"><el-input v-model="form.city_name" /></el-form-item></el-col>
      </el-row>
    </template>
  </MdmGenericList>
</template>

<style scoped>
.code-text { font-family: monospace; font-size: 12px; color: #0f6cbd; background: #eff6ff; padding: 2px 6px; border-radius: 4px; }
</style>
