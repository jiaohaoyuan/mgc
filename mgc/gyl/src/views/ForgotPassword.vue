<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Odometer, User, Key, Lock, Message, Phone } from '@element-plus/icons-vue'

const router = useRouter()

const activeStep = ref(0)
const loading = ref(false)
const smsLoading = ref(false)
const countdown = ref(0)
let timer: any = null

const form = reactive({
  username: '',
  mobile: '',
  smsCode: '',
  helperCode: '',
  newPassword: '',
  confirmPassword: ''
})

// 开始倒计时
const startCountdown = () => {
  countdown.value = 60
  timer = setInterval(() => {
    if (countdown.value > 0) {
      countdown.value--
    } else {
      clearInterval(timer)
    }
  }, 1000)
}

// 获取验证码
const handleGetCode = async () => {
  if (!form.username || !form.mobile) {
    ElMessage.warning('请先输入用户名和注册手机号')
    return
  }
  
  smsLoading.value = true
  try {
    const res = await fetch('http://localhost:3000/api/sms/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: form.username,
        mobile: form.mobile
      })
    })
    const data = await res.json()
    if (data.code === 200) {
      ElMessage.success('验证码已发送')
      startCountdown()
    } else {
      ElMessage.error(data.msg || '获取验证码失败')
    }
  } catch (err) {
    ElMessage.error('服务异常，请稍后再试')
  } finally {
    smsLoading.value = false
  }
}

// 下一步
const nextStep = async () => {
  if (activeStep.value === 0) {
    if (!form.username || !form.mobile || !form.smsCode) {
      ElMessage.warning('请填写用户名、注册手机号和短信验证码')
      return
    }
    loading.value = true
    try {
      const res = await fetch('http://localhost:3000/api/sms/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          smsCode: form.smsCode
        })
      })
      const data = await res.json()
      if (data.code === 200) {
        activeStep.value = 1
      } else {
        ElMessage.error(data.msg || '短信验证码错误')
      }
    } catch (err) {
      ElMessage.error('网络异常，请验证后再试')
    } finally {
      loading.value = false
    }
  } else if (activeStep.value === 1) {
    if (!form.helperCode) {
      ElMessage.warning('请填写超管辅助动态码')
      return
    }
    loading.value = true
    try {
      const res = await fetch('http://localhost:3000/api/admin/verify-helper-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          helperCode: form.helperCode
        })
      })
      const data = await res.json()
      if (data.code === 200) {
        activeStep.value = 2
      } else {
        ElMessage.error(data.msg || '超管辅助动态码错误')
      }
    } catch (err) {
      ElMessage.error('网络异常，请验证后再试')
    } finally {
      loading.value = false
    }
  }
}

// 上一步
const prevStep = () => {
  if (activeStep.value > 0) {
    activeStep.value--
  }
}

// 提交重置
const handleReset = async () => {
  if (!form.newPassword || !form.confirmPassword) {
    ElMessage.error('请填写完整密码')
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    ElMessage.error('两次输入的新密码不一致')
    return
  }
  if (form.newPassword.length < 6) {
    ElMessage.error('新密码长度不能少于6位')
    return
  }

  loading.value = true
  try {
    const res = await fetch('http://localhost:3000/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username,
        smsCode: form.smsCode,
        helperCode: form.helperCode,
        newPassword: form.newPassword
      })
    })
    const data = await res.json()
    if (data.code === 200) {
      ElMessage.success('密码重置成功，请重新登录')
      setTimeout(() => router.push('/login'), 1500)
    } else {
      ElMessage.error(data.msg || '重置失败，请检查验证码或辅助码')
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
  <div class="fp-container">
    <!-- 左侧插画区域 -->
    <div class="illustration-side">
      <div class="brand-title">
        <el-icon class="logo-icon"><Odometer /></el-icon>
        供应链决策平台 / SCMP
      </div>

      <div class="illustration-wrapper">
        <img src="@/assets/login-bg.png" alt="牧场数字化" class="bg-img" />
        <div class="smart-collar-ping">
          <div class="ping-ring"></div>
          <div class="ping-dot"></div>
          <div class="collar-text">身份双重校验中...</div>
        </div>
      </div>

      <div class="slogan">
        <h2>安全找回密码</h2>
        <p>通过手机短信与超级管理员辅助码双重校验，保障您的账户资产安全。</p>
      </div>
    </div>

    <!-- 右侧表单区域 -->
    <div class="form-side">
      <div class="fp-box">
        <div class="fp-header">
          <h2>找回密码</h2>
          <p>完成以下步骤以重置您的系统密码</p>
        </div>

        <el-steps :active="activeStep" finish-status="success" align-center class="custom-steps">
          <el-step title="身份验证" />
          <el-step title="超管校验" />
          <el-step title="重置密码" />
        </el-steps>

        <div class="step-content">
          <el-form :model="form" label-position="top">
            <!-- 第一步：身份验证 (含用户名和手机比对) -->
            <template v-if="activeStep === 0">
              <el-form-item label="用户名">
                <el-input
                  v-model="form.username"
                  placeholder="请输入要找回的账号名"
                  size="large"
                  :prefix-icon="User"
                />
              </el-form-item>
              <el-form-item label="注册手机号">
                <el-input
                  v-model="form.mobile"
                  placeholder="请输入该账号绑定的手机号"
                  size="large"
                  :prefix-icon="Phone"
                />
              </el-form-item>
              <el-form-item label="短信验证码">
                <div class="sms-input-group">
                  <el-input
                    v-model="form.smsCode"
                    placeholder="请输入6位验证码"
                    size="large"
                    :prefix-icon="Message"
                  />
                  <el-button 
                    type="primary" 
                    plain 
                    :disabled="countdown > 0 || !form.username || !form.mobile" 
                    :loading="smsLoading"
                    class="get-code-btn"
                    @click="handleGetCode"
                  >
                    {{ countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}
                  </el-button>
                </div>
                <div class="field-hint">验证码将发送至账号绑定的手机号</div>
              </el-form-item>
              <el-button type="primary" class="submit-btn" size="large" :loading="loading" @click="nextStep">下一步</el-button>
            </template>

            <!-- 第二步：超管辅助校验 -->
            <template v-if="activeStep === 1">
              <el-form-item label="超级管理员辅助动态码">
                <el-input
                  v-model="form.helperCode"
                  placeholder="请向超级管理员获取6位辅助码"
                  size="large"
                  :prefix-icon="Key"
                />
                <div class="field-hint">辅助码由超级管理员在「个人中心」中提供</div>
              </el-form-item>
              <div class="btn-group">
                <el-button size="large" @click="prevStep">上一步</el-button>
                <el-button type="primary" size="large" class="flex-grow" :loading="loading" @click="nextStep">下一步</el-button>
              </div>
            </template>

            <!-- 第三步：重置密码 -->
            <template v-if="activeStep === 2">
              <el-form-item label="新密码">
                <el-input
                  v-model="form.newPassword"
                  type="password"
                  placeholder="请输入新密码（至少6位）"
                  size="large"
                  :prefix-icon="Lock"
                  show-password
                />
              </el-form-item>
              <el-form-item label="确认新密码">
                <el-input
                  v-model="form.confirmPassword"
                  type="password"
                  placeholder="请再次输入新密码"
                  size="large"
                  :prefix-icon="Lock"
                  show-password
                  @keyup.enter="handleReset"
                />
              </el-form-item>
              <div class="btn-group">
                <el-button size="large" @click="prevStep">上一步</el-button>
                <el-button 
                  type="success" 
                  size="large" 
                  class="flex-grow" 
                  :loading="loading"
                  @click="handleReset"
                >
                  确认重置
                </el-button>
              </div>
            </template>

            <div v-if="activeStep === 0" class="back-link">
              <router-link to="/login" class="back-to-login">← 返回登录</router-link>
            </div>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fp-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: var(--bg-color);
  overflow: hidden;
}

.illustration-side {
  flex: 5;
  background: linear-gradient(135deg, #1e3a8a, #4f46e5);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 40px;
  color: white;
  position: relative;
  overflow: hidden;
}

.brand-title {
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 12px;
  letter-spacing: 1px;
  z-index: 10;
}

.illustration-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bg-img {
  max-width: 80%;
  max-height: 80%;
  border-radius: 24px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  object-fit: contain;
  z-index: 5;
}

.smart-collar-ping {
  position: absolute;
  top: 60%;
  left: 45%;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.ping-dot {
  width: 12px;
  height: 12px;
  background-color: #f59e0b;
  border-radius: 50%;
  box-shadow: 0 0 10px #f59e0b;
}

.ping-ring {
  position: absolute;
  top: -14px;
  left: -14px;
  width: 40px;
  height: 40px;
  border: 2px solid #f59e0b;
  border-radius: 50%;
  animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}

.collar-text {
  margin-top: 10px;
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.5);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #fde68a;
  backdrop-filter: blur(4px);
  animation: pulse 2s infinite;
  white-space: nowrap;
}

@keyframes ping {
  75%, 100% {
    transform: scale(2.5);
    opacity: 0;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.slogan {
  z-index: 10;
  max-width: 600px;
}

.slogan h2 {
  font-size: 36px;
  font-weight: 800;
  margin-bottom: 16px;
  line-height: 1.2;
}

.slogan p {
  font-size: 18px;
  color: #e0e7ff;
  line-height: 1.6;
}

/* 右侧表单区 */
.form-side {
  flex: 4;
  background-color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fp-box {
  width: 100%;
  max-width: 440px;
  padding: 0 40px;
}

.fp-header {
  margin-bottom: 36px;
  text-align: center;
}

.fp-header h2 {
  font-size: 32px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 8px;
}

.fp-header p {
  color: #64748b;
  font-size: 15px;
}

.field-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 6px;
  line-height: 1.4;
}

.custom-steps {
  margin-bottom: 30px;
}

.step-content {
  min-height: 280px;
}

.sms-input-group {
  display: flex;
  gap: 12px;
  width: 100%;
}

.get-code-btn {
  width: 120px;
  flex-shrink: 0;
}

.btn-group {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.flex-grow {
  flex: 1;
}

.submit-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  margin-top: 8px;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.4);
  transition: all 0.3s ease;
}

.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.5);
}

.back-link {
  text-align: center;
  margin-top: 20px;
}

.back-to-login {
  color: var(--primary-color);
  font-size: 14px;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.3s;
}

.back-to-login:hover {
  text-decoration: underline;
}
</style>
