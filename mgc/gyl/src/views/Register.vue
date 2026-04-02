<!-- 这个文件是什么作用显示的是什么：这是用户注册页面。显示/实现的是：供新用户填写账号、密码、个人信息以完成账户创建的流转表单。 -->
<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

const router = useRouter()
const appStore = useAppStore()
const { roles, posts, departments, users } = storeToRefs(appStore)

const currentStep = ref(0)
const loading = ref(false)

// Step 1: Admin Login
const adminForm = reactive({ username: '', password: '' })
const handleAdminVerify = () => {
  if (adminForm.username === 'jiaohaoyuan' && adminForm.password === '123456789') {
    ElMessage.success('管理员验证成功')
    currentStep.value = 1
  } else {
    ElMessage.error('管理员账号或密码错误')
  }
}

// Step 2: Register Account
const registerForm = reactive({ username: '', password: '', nickname: '' })

// 账号验证: 仅数字，11位
const isValidAccount = (account: string) => /^\d{11}$/.test(account)
// 密码验证: 11位，必须包含字母和数字
const isValidPassword = (pwd: string) => /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{11}$/.test(pwd)

const handleNextStep2 = () => {
  if (!registerForm.username || !registerForm.password) {
    ElMessage.error('请填写账号和密码')
    return
  }
  if (!isValidAccount(registerForm.username) || !isValidPassword(registerForm.password)) {
    ElMessage.error('格式未达要求')
    return
  }
  if (!registerForm.nickname) {
    registerForm.nickname = '新用户' + registerForm.username.slice(-4)
  }
  currentStep.value = 2
}

// Step 3: Select Posts and Roles
const assignForm = reactive({
  postIds: [] as number[],
  roleIds: [] as number[]
})

const handleFinish = async () => {
  loading.value = true
  try {
    const defaultDept = departments.value[0]
    
    const requestData = {
      username: registerForm.username,
      password: registerForm.password,
      nickname: registerForm.nickname,
      phone: registerForm.username,
      deptId: defaultDept ? defaultDept.id : 0,
      deptName: defaultDept ? defaultDept.label : '默认部门',
      postIds: [...assignForm.postIds],
      roleIds: [...assignForm.roleIds]
    }

    const res = await fetch('http://localhost:3000/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    })
    
    const data = await res.json()
    if (data.code === 200) {
      ElMessage.success('用户注册完成！记录已插入库中，请登录')
      setTimeout(() => {
        router.push('/login')
      }, 1000)
    } else {
      ElMessage.error(data.msg || '注册失败')
    }
  } catch (err) {
    ElMessage.error('网络错误或服务器异常')
    console.error(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="register-container">
    <div class="register-box">
      <div class="header">
        <h2>新用户注册</h2>
        <p>供应链决策平台</p>
      </div>
      
      <el-steps :active="currentStep" finish-status="success" align-center style="margin-bottom: 40px">
        <el-step title="管理员验证" />
        <el-step title="填写账号信息" />
        <el-step title="分配岗位与权限" />
      </el-steps>
      
      <!-- Step 1: Admin Authentication -->
      <div v-if="currentStep === 0" class="step-content">
        <div class="info-alert">请先输入系统管理员账号进行验证授权</div>
        <el-form :model="adminForm" label-position="top">
          <el-form-item label="管理员账号">
            <el-input 
              v-model="adminForm.username" 
              placeholder="请输入管理员账号" 
              size="large"
              prefix-icon="User"
            />
          </el-form-item>
          <el-form-item label="管理员密码">
            <el-input 
              v-model="adminForm.password" 
              type="password"
              placeholder="请输入管理员密码" 
              size="large"
              prefix-icon="Lock"
              show-password
              @keyup.enter="handleAdminVerify"
            />
          </el-form-item>
          <el-button type="primary" class="full-btn" size="large" @click="handleAdminVerify">
            验证并继续
          </el-button>
          <div class="back-link">
            <router-link to="/login">返回登录页面</router-link>
          </div>
        </el-form>
      </div>

      <!-- Step 2: Register Account -->
      <div v-if="currentStep === 1" class="step-content">
        <div class="info-alert">设置要注册的新用户的账号与密码</div>
        <el-form :model="registerForm" label-position="top">
          <el-form-item label="新用户账号">
            <el-input 
              v-model="registerForm.username" 
              placeholder="仅数字且为11位 (如: 13800000000)" 
              size="large"
              prefix-icon="User"
            />
          </el-form-item>
          <el-form-item label="新用户密码">
            <el-input 
              v-model="registerForm.password" 
              type="password"
              placeholder="长度为11位，必须由字母和数字组成" 
              size="large"
              prefix-icon="Lock"
              show-password
            />
          </el-form-item>
          <el-form-item label="用户昵称 (可选)">
            <el-input 
              v-model="registerForm.nickname" 
              placeholder="不填将默认生成" 
              size="large"
              prefix-icon="Edit"
            />
          </el-form-item>
          <div class="btn-group">
            <el-button size="large" @click="currentStep = 0">上一步</el-button>
            <el-button type="primary" size="large" @click="handleNextStep2">下一步</el-button>
          </div>
        </el-form>
      </div>

      <!-- Step 3: Assign Role and Post -->
      <div v-if="currentStep === 2" class="step-content">
        <div class="info-alert">为用户分配相应的岗位与角色权限</div>
        <el-form :model="assignForm" label-position="top">
          <el-form-item label="分配岗位">
            <el-select 
              v-model="assignForm.postIds" 
              multiple 
              placeholder="请选择岗位" 
              size="large"
              style="width: 100%"
            >
              <el-option
                v-for="p in posts"
                :key="p.id"
                :label="p.name"
                :value="p.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="分配角色权限">
            <el-select 
              v-model="assignForm.roleIds" 
              multiple 
              placeholder="请选择角色" 
              size="large"
              style="width: 100%"
            >
              <el-option
                v-for="r in roles"
                :key="r.id"
                :label="r.name"
                :value="r.id"
              />
            </el-select>
          </el-form-item>
          <div class="btn-group">
            <el-button size="large" @click="currentStep = 1">上一步</el-button>
            <el-button type="success" size="large" :loading="loading" @click="handleFinish">
              完成注册
            </el-button>
          </div>
        </el-form>
      </div>

    </div>
  </div>
</template>

<style scoped>
.register-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: linear-gradient(135deg, #1e3a8a, #4f46e5);
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.register-box {
  width: 100%;
  max-width: 500px;
  background: white;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h2 {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 8px;
}

.header p {
  color: #64748b;
  font-size: 15px;
}

.step-content {
  animation: fadeIn 0.4s ease-out forwards;
}

.info-alert {
  background-color: #f0fdf4;
  color: #166534;
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 24px;
  font-size: 14px;
  border-left: 4px solid #16a34a;
}

.full-btn {
  width: 100%;
  margin-top: 10px;
}

.btn-group {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

.btn-group .el-button {
  flex: 1;
}

.btn-group .el-button + .el-button {
  margin-left: 16px;
}

.back-link {
  text-align: center;
  margin-top: 20px;
}

.back-link a {
  color: #64748b;
  font-size: 14px;
  text-decoration: none;
  transition: color 0.3s;
}

.back-link a:hover {
  color: var(--primary-color);
  text-decoration: underline;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
