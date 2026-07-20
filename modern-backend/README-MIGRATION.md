# มัดรวมระบบ Modern Backend (Docker + MongoDB)

ผมเตรียมโครงสร้างไว้ให้สำหรับย้ายเครื่องตามที่คุณต้องการแล้วครับ เมื่อพร้อมย้ายเครื่องให้ทำตามดังนี้:

## 1. การย้าย Machine
ก๊อปปี้โฟลเดอร์ `modern-backend` ไปวางที่เครื่องใหม่ได้เลย

## 2. การตั้งค่า (Configuration)
1. เข้าไปที่ `modern-backend`
2. ก๊อปปี้ไฟล์ `.env.example` เป็น `.env`
3. แก้ไขข้อมูลใน `.env` เช่น USER/PASS ของ DB และข้อมูล Google Sheet สำหรับการย้ายข้อมูล

## 3. การรันระบบ (ด้วย Docker)
ที่เครื่องใหม่ (ที่มี Docker ติดตั้งแล้ว) ให้รันคำสั่ง:
```bash
docker-compose up -d
```
ระบบจะรัน 3 อย่างอัตโนมัติ:
- **API**: พอร์ต 3001
- **MongoDB**: พอร์ต 27017
- **Mongo Express (GUI)**: พอร์ต 8081 (สำหรับดูข้อมูลง่ายๆ)

## 4. การย้ายข้อมูลจาก Google Sheets (ครั้งแรก)
เมื่อรันระบบขึ้นมาแล้ว ให้รันคำสั่งเพื่อดูข้อมูลเข้า MongoDB:
```bash
docker-compose exec api npm run migrate
```

## 5. การทำให้ Vercel มองเห็น Server ของคุณ (Networking)
เนื่องจาก Vercel อยู่บนอินเทอร์เน็ต (Public) แต่ Server ของคุณอยู่ในบ้าน/ออฟฟิศ (Private) คุณต้องทำให้ Server ของคุณ "เปิดรับ" การเชื่อมต่อจากภายนอกได้ โดยมี 3 วิธีหลัก:

### วิธีที่ 1: ใช้ Cloudflare Tunnel (แนะนำที่สุด 🌟)
วิธีนี้ปลอดภัยและไม่ต้อง Forward Port ที่ Router:
1. ติดตั้ง `cloudflared` บน Server
2. เชื่อมต่อ Local Port 3001 เข้ากับโดเมนของคุณ (เช่น `api.yourdomain.com`)
3. Vercel จะเรียกไปที่โดเมนนั้น และ Cloudflare จะส่งข้อมูลลงมาที่เครื่องคุณเอง

### วิธีที่ 2: Port Forwarding (แบบดั้งเดิม)
1. เข้าไปที่ Router ของคุณ แล้วตั้งค่า **Port Forwarding** พอร์ต `3001` ให้ชี้ไปยัง IP เครื่องเซิร์ฟเวอร์
2. ตรวจสอบ IP ขาเข้าของบ้าน (Public IP) จากเว็บเช่น `whatismyip.com`
3. ที่ Vercel ให้ตั้งค่า `VITE_GAS_WEBAPP_URL` ให้เป็น `http://[IP-บ้านของคุณ]:3001/api`
   *(ถ้า IP บ้านเปลี่ยนบ่อย ต้องใช้ DDNS เช่น No-IP)*

### วิธีที่ 3: ใช้ VPS (DigitalOcean, Azure, AWS)
สำหรับระบบที่ต้องการความเสถียร 100% ผมแนะนำเช่า Cloud Server เล็กๆ (เดือนละ ~200 บาท) แล้วรัน Docker บนนั้น จะได้ Public IP ถาวรทันทีครับ

## 6. การตั้งค่าที่ Frontend (Vercel)
เมื่อคุณเลือกวิธีเชื่อมต่อได้แล้ว (ได้ URL มาแล้ว เช่น `https://api.yourdomain.com/api`) ให้ทำดังนี้:

1. เข้าระบบ **Vercel Dashboard**
2. ไปที่โปรเจกต์ของคุณ -> **Settings** -> **Environment Variables**
3. เพิ่มตัวแปร:
   - **Key**: `VITE_GAS_WEBAPP_URL`
   - **Value**: `[URL-จากข้อ-5]/api` (ต้องใส่ `/api` ต่อท้ายด้วย)
4. กด **Save** และทำการ **Redeploy** โปรเจกต์หนึ่งรอบ
## 7. ระบบความปลอดภัย (Security & Restriction) 🔒
เพื่อให้มั่นใจว่า **เฉพาะ Frontend ของคุณเท่านั้น** ที่จะเรียกใช้งาน API ที่เครื่องคุณได้ ผมได้ใส่ระบบ **API Key** ไว้ให้แล้วครับ:

### ขั้นตอนการตั้งค่า:
1. ในไฟล์ `.env` ของ Backend ให้ตั้งค่า `API_KEY=[รหัสลับของคุณ]`
2. ใน **Vercel Dashboard** ให้เพิ่ม Environment Variable อีก 1 ตัว:
   - **Key**: `VITE_API_KEY`
   - **Value**: `[รหัสลับเดียวกับข้อ 1]`

### การทำงาน:
ระบบจะอนุญาตเฉพาะ HTTP Request ที่ส่ง Header `x-api-key` มาถูกต้องเท่านั้น หากคนอื่นพยายามเรียก URL ของคุณจะโดนตีกลับเป็น `401 Unauthorized` ทันทีครับ

---
**สรุปวิธีที่ฟรีและดีที่สุดสำหรับคุณ:**
1. ใช้ **Cloudflare Tunnel** (ฟรี) เพื่อชี้โดเมนมายังเครื่องคอมฯ คุณ
2. ใช้ **API Key** (ที่ผมเพิ่มให้ในโค้ด) เพื่ออนุญาตเฉพาะ Vercel ของคุณเท่านั้น
3. ไม่ต้องแลกเปลี่ยน IP หรือเปิด Port ที่ Router ให้เสี่ยงครับ

## 8. CatLog AI / ThaiLLM Provider (ใหม่)

การเรียก ThaiLLM ต้องผ่าน `POST /api/ai/chat` ของ backend เท่านั้น ห้ามใส่ `THAILLM_API_KEY` หรือ `VITE_*` ที่เป็น provider secret ใน frontend

1. ตั้งค่าใน `modern-backend/.env`: `AI_SESSION_SECRET` (อย่างน้อย 32 ตัวอักษร), `THAILLM_API_KEY` (ใช้ key ใหม่ที่ rotate แล้ว), `THAILLM_API_URL=https://thaillm.or.th/api/v1/chat/completions` และ `CORS_ORIGINS`
2. ตั้งค่า frontend production ให้ `VITE_AI_API_BASE_URL` ชี้ไปยัง public HTTPS URL ของ backend ต่อด้วย `/api/ai`
3. เปิด `THAILLM_ALLOW_INSECURE_HTTP=true` เฉพาะกรณีจำเป็นจริงและต้องอยู่หลังเครือข่ายที่เชื่อถือได้ เพราะจะทำให้ backend-to-provider hop มีความเสี่ยงดักข้อมูล
4. Backend จะตรวจสอบ session กับ Users ใน Supabase ใหม่ทุกคำขอ, บังคับ RBAC, จำกัด rate ต่อ user/IP และแปลงคำถามเป็นตัวกรองวันที่ สถานะ ชื่อเล่น และ keyword ก่อน query งานย้อนหลัง
5. คำถาม “งานทั้งหมด / แดชบอร์ด / ภาพรวม” จะคำนวณสถิติจำนวนงานจากฐานข้อมูลโดยตรงตามสิทธิ์และตัวกรอง ไม่ใช่นับจากรายการตัวอย่างที่ AI อ่าน
6. การค้นเว็บ fallback ใช้ DuckDuckGo Instant Answer ซึ่งอาจไม่ทันข่าวล่าสุด หากต้องการค้นเว็บ/ข่าวที่สดกว่า ให้ตั้ง `BRAVE_SEARCH_API_KEY` บน backend (ห้ามใส่ใน Vite) เพื่อใช้ Brave Search API

คีย์ ThaiLLM เดิมที่เคยอยู่ใน frontend ถือว่าถูกเปิดเผยแล้ว ต้อง revoke/rotate ที่ผู้ให้บริการ แม้จะลบออกจาก source แล้วก็ตาม
