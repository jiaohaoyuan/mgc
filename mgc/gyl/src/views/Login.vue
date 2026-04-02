<!-- 这个文件是什么作用显示的是什么：这是用户登录页面。显示/实现的是：用户名/密码输入框及登录、注册、忘记密码等操作入口。 -->
<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const router = useRouter()

const loginForm = reactive({
  username: 'jiaohaoyuan',
  password: ''
})

const loading = ref(false)

const handleLogin = async () => {
  if (!loginForm.username || !loginForm.password) {
    ElMessage.error('请填写账号和密码')
    return
  }

  loading.value = true
  try {
    const res = await axios.post('/login', {
      username: loginForm.username,
      password: loginForm.password
    })
    const data = res.data
    if (data.code === 200) {
      ElMessage.success(data.msg || '登录成功，欢迎来到供应链决策平台')
      localStorage.setItem('accessToken', data.data.token)
      localStorage.setItem('isAuthenticated', '1')
      localStorage.setItem('currentUser', JSON.stringify({
        username: data.data.username,
        nickname: data.data.nickname || data.data.username,
        role: data.data.role
      }))
      router.push('/department')
    } else {
      ElMessage.error(data.msg || '账号或密码不正确！')
    }
  } catch (err: any) {
    const errorMsg = err.response?.data?.msg || '网络错误或服务器异常'
    ElMessage.error(errorMsg)
    console.error(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <!-- 左侧插画动画区域 -->
    <div class="illustration-side">
      <div class="brand-title">
        <el-icon class="logo-icon"><Odometer /></el-icon>
        供应链决策平台 / SCMP
      </div>
      
      <div class="illustration-wrapper">
        <img src="@/assets/login-bg.png" alt="牧场数字化" class="bg-img" />
        
        <!-- CSS模拟电子项圈的闪烁点：需要固定在一个绝对定位相对牛脖子的地方 -->
        <!-- 注意：我们通过绝对定位来找到大致图片中牛的脖子，如果需要更准确可以用坐标 -->
        <div class="smart-collar-ping">
          <div class="ping-ring"></div>
          <div class="ping-dot"></div>
          <div class="collar-text">智能耳标项圈连接中...</div>
        </div>
      </div>
      
      <div class="slogan">
        <h2>产供销一体化全链路管理</h2>
        <p>让每一滴奶都有迹可循，实现从牧场到餐桌的全面数智化升级。</p>
      </div>
    </div>

    <!-- 右侧登录区域 -->
    <div class="form-side">
      <div class="login-box">
        <div class="login-header">
          <h2>系统登录</h2>
          <p>欢迎回来！请登录您的账号</p>
        </div>
        
        <el-form :model="loginForm" label-position="top">
          <el-form-item label="管理员账号">
            <el-input 
              v-model="loginForm.username" 
              placeholder="请输入账号 (如: jiaohaoyuan)" 
              size="large"
              prefix-icon="User"
            />
          </el-form-item>
          <el-form-item label="登录密码">
            <el-input 
              v-model="loginForm.password" 
              type="password"
              placeholder="请输入密码 (123456789)" 
              size="large"
              prefix-icon="Lock"
              show-password
              @keyup.enter="handleLogin"
            />
          </el-form-item>
          
          <div class="form-options">
            <el-checkbox>保持登录状态</el-checkbox>
            <router-link to="/forgot-password" class="forget-pwd">忘记密码？</router-link>
          </div>

          <el-button 
            type="primary" 
            class="login-btn" 
            size="large" 
            :loading="loading"
            @click="handleLogin"
          >
            登 录
          </el-button>
        </el-form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
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

/* 电子项圈扫描动画动画: 这里使用绝对定位放置到画面居中偏下方，模拟牛脖子位置 */
.smart-collar-ping {
  position: absolute;
  top: 60%; /* 根据图片具体情况可能需要调整 */
  left: 45%;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.ping-dot {
  width: 12px;
  height: 12px;
  background-color: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 10px #10b981;
}

.ping-ring {
  position: absolute;
  top: -14px;
  left: -14px;
  width: 40px;
  height: 40px;
  border: 2px solid #10b981;
  border-radius: 50%;
  animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}

.collar-text {
  margin-top: 10px;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.5);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: #a7f3d0;
  backdrop-filter: blur(4px);
  animation: pulse 2s infinite;
}

@keyframes ping {
  75%, 100% {
    transform: scale(2.5);
    opacity: 0;
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
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

.login-box {
  width: 100%;
  max-width: 420px;
  padding: 0 40px;
}

.login-header {
  margin-bottom: 40px;
  text-align: center;
}

.login-header h2 {
  font-size: 32px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 8px;
}

.login-header p {
  color: #64748b;
  font-size: 15px;
}

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.forget-pwd {
  color: var(--primary-color);
  font-size: 14px;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.3s;
}

.forget-pwd:hover {
  text-decoration: underline;
}

.login-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.4);
  transition: all 0.3s ease;
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.5);
}
</style>
