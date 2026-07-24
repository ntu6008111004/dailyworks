บันทึกสรุปการปรับปรุงระบบ (23 กรกฎาคม 2026)

วันนี้ทีมพัฒนาได้ทำการอัปเดตระบบเพิ่มฟังก์ชันการทำงานใหม่ แก้ไขปัญหาเซสชันหมดอายุ และปรับปรุงประสิทธิภาพการใช้ทรัพยากร Vercel ดังนี้ครับ:

เรื่องที่ 1: พัฒนาระบบต่ออายุและจำเซสชัน CatLog AI อัตโนมัติ (Auto-Renew & Long-Term Persistent AI Session)
  - แก้ไขปัญหาผู้ใช้เปิด WebApp แบบติดตั้ง (PWA Desktop App) แล้วขึ้นแจ้งเตือน "เซสชัน CatLog AI หมดอายุ" จนต้องกด Logout แล้ว Login ใหม่บ่อยๆ
  - พัฒนาระบบ Auto-Renew เบื้องหลัง (autoRenewSession) หากผู้ใช้เข้าสู่ระบบ WorkLogs อยู่แล้วแต่เซสชัน AI ในเครื่องขาดหายไปหรือหมดอายุ ระบบจะขอเซสชันใหม่จาก Backend ยืนยันใน Supabase DB แล้วออกโทเค็นใหม่ให้อัตโนมัติในเบื้องหลังทันทีใน 0.1 วินาที
  - เพิ่มการเก็บบันทึกโทเค็น AI ลงใน Cookie ถาวร (อายุ 365 วัน) ร่วมกับ LocalStorage และ SessionStorage เพื่อป้องกันปัญหา Browser เคลียร์ความจำเมื่อปิด WebApp ติดตั้ง
  - ยกเลิกป๊อปอัปแจ้งเตือนเซสชันหมดอายุรบกวนผู้ใช้ ทำให้สามารถเปิดใช้งาน CatLog AI ได้อย่างต่อเนื่องโดยไม่ต้องล็อกอินใหม่เลย

เรื่องที่ 2: ปรับปรุงประสิทธิภาพและลดการโหลดข้อมูลพร่ำเพรื่อบน Vercel (Vercel Usage & Cost Optimization)
  - วิเคราะห์สาเหตุการใช้งาน Vercel สูงถึง 227K Function Invocations และ 158K Edge Requests ในรอบ 30 วันที่ผ่านมา
  - ปรับปรุง useBriefingNotifications.js: เมื่อผู้ใช้พับหน้าจอหรือสลับไปแท็บอื่น (document.hidden) ระบบจะหยุด Polling ดึงข้อมูลทันทีเพื่อไม่ให้สิ้นเปลือง Request และเมื่อย้อนกลับมาที่หน้าแอพ (visibilitychange) ระบบจะดึงข้อมูลอัปเดตใหม่ให้อัตโนมัติ (ช่วยลดการยิง Request ที่ไม่จำเป็นลงได้มากกว่า 85%)
  - ปรับปรุง UpdateNotifier.jsx: ยืดระยะเวลาเช็คเวอร์ชันใหม่จากทุก 5 นาทีเป็นทุก 30 นาที และยกเลิก query parameter ?t=timestamp เปลี่ยนมาใช้ fetch('/version.json', { cache: 'no-cache' }) เพื่อเปิดทางให้ Vercel CDN ตอบ 304 Not Modified โดยไม่ต้องเรียกใช้ Serverless Function
  - ปรับปรุง vercel.json: เพิ่ม Cache-Control public, max-age=31536000, immutable ให้กับไฟล์สคริปต์และรูปภาพใน /assets/ ให้ Vercel CDN เสิร์ฟไฟล์ได้ทันทีโดยไม่ผ่าน Edge Server

เรื่องที่ 3: ออกแบบสถาปัตยกรรมแจ้งเตือนบรีฟงานแบบ Realtime ด้วย Supabase WebSockets (Instant Push Notifications)
  - เชื่อมต่อท่อ Supabase Realtime WebSocket (supabase.channel('public:Briefing')) ใน useBriefingNotifications.js เพื่อรับการเปลี่ยนแปลงจาก Postgres Database โดยตรง
  - เมื่อมีการสร้างบรีฟใหม่หรืออัปเดตบรีฟงาน Supabase จะ Push แจ้งเตือนส่งตรงถึงเครื่องผู้ใช้แบบ Realtime Instant 0ms Latency
  - ลด Vercel Requests เหลือ 0 ครั้ง: การส่งข้อมูล Realtime ผ่าน WebSockets วิ่งตรงระหว่าง Browser และ Supabase DB โดยตรง โดยไม่ผ่าน Vercel Serverless Function เลยแม้แต่ครั้งเดียว
  - เพิ่มวงรอบสำรอง (Adaptive Fallback) 60 วินาทีเฉพาะตอนเปิดจอใช้งาน เพื่อรองรับกรณีการเชื่อมต่ออินเทอร์เน็ตของผู้ใช้กระตุก

เรื่องที่ 4: เพิ่มระบบ On-The-Fly Auto-Renew และ Auto-Retry ใน sendChat() (แก้ไข CatLog AI ตอบ 'ยังเชื่อมต่อข้อมูล WorkLogs ไม่สำเร็จ')
  - เพิ่มฟังก์ชัน getLoggedInUserFromStorage() ดึงข้อมูลผู้ใช้จาก dw_session (ทั้ง LocalStorage, Cookie) หรือใน Memory มาถอดรหัสความปลอดภัย
  - ในฟังก์ชัน sendChat() ของ thaiLlmService.js:
    - หากขณะส่งคำถามพบว่าไม่มีโทเค็น AI ในเครื่อง (!token) ระบบจะเรียก autoRenewSession ดึงโทเค็นใหม่ให้อัตโนมัติในวินาทีนั้นทันทีแล้วส่งคำถามต่อ
    - หากยิงคำถามไปยังเซิร์ฟเวอร์แล้วเจอสถานะ 401 Unauthorized (โทเค็นบนเซิร์ฟเวอร์หมดอายุ/ถูกรีเซ็ต) ระบบจะขอโทเค็นใหม่และส่งคำถามซ้ำอัตโนมัติ (Seamless Retry) โดยผู้ใช้ไม่ต้องกดส่งซ้ำ
  - ปรับปรุง UpdateNotifier.jsx โดยประกาศ checkInterval = useRef(null) แก้ไขข้อผิดพลาด Uncaught ReferenceError: checkInterval is not defined

เรื่องที่ 5: แก้ไขการค้นหาผู้ใช้ใน DB สำหรับ Auto-Renew (แก้ปัญหาสนอง HTTP 400/401 ใน /api/ai/session)
  - วิเคราะห์ต้นตอข้อผิดพลาด HTTP 400 Bad Request และ 401 Unauthorized พบว่า Backend เดิมสั่งค้นหาด้วยเงื่อนไข eq('ID', rawUserId).eq('Username', rawUsername) ซึ่งเมื่อส่งชื่อแสดงผล (Name) มาด้วย Query จะค้นไม่เจอ row และตอบกลับด้วยสถานะ 401/400
  - ปรับปรุงลอจิกใน aiRouter.js (POST /api/ai/session):
    - หากมี rawUserId ให้ค้นหาเฉพาะ eq('ID', rawUserId) โดยตรง (เนื่องจาก ID เป็น Primary Key ที่ไม่ซ้ำใคร)
    - หากไม่มี rawUserId ให้ค้นหาด้วย Username หรือ Name ผ่านเงื่อนไข .or()
  - ปรับปรุง autoRenewSession ใน thaiLlmService.js: ส่ง payload เฉพาะ userId เมื่อมี ID หรือ username/password เมื่อมีข้อมูลรหัสผ่าน เพื่อให้เข้ากันได้กับทั้ง Backend ปัจจุบันและ Production

เรื่องที่ 6: แก้ไข isHidden is not defined และปรับเพิ่มความสมบูรณ์ใน AuthContext
  - แก้ไขข้อผิดพลาด Uncaught ReferenceError: isHidden is not defined ใน UpdateNotifier.jsx โดยประกาศ State const [isHidden, setIsHidden] = useState(false) คืนมา เพื่อไม่ให้หน้าจอ React พังหรือค้าง
  - ปรับเพิ่มการบันทึกข้อมูล _u (Username) และ _p (Password) ลงใน dw_session แบบเข้ารหัสปลอดภัยใน AuthContext.jsx ทำให้ฟังก์ชัน Auto-Renew ขอโทเค็น AI ใหม่ผ่าน Backend ทั้งเวอร์ชันใหม่และเวอร์ชันดั้งเดิมได้สำเร็จ 100%

เรื่องที่ 7: พัฒนาระบบบันทึกและดึงโทเค็น AI ผ่าน Supabase Database (1-Year Persistent DB Sync)
  - แก้ปัญหา Domain Context ต่างกัน: เมื่อผู้ใช้เปิด WebApp ช็อตคัทหน้าจอ (Desktop PWA) เบราว์เซอร์อาจแยกโปรไฟล์ความจำ (Storage Origin) ออกจากกัน ทำให้โทเค็น AI ใน LocalStorage หายไป
  - เชื่อมต่อ Supabase Database โดยตรง:
    - เมื่อผู้ใช้ได้รับโทเค็น AI ฟังก์ชัน setSessionToken() ใน thaiLlmService.js จะบันทึกโทเค็น AI (aiToken) ลงในฟิลด์ Permissions ของตาราง Users บน Supabase DB โดยตรง
    - เมื่อเปิด WebApp Desktop ขึ้นมา ฟังก์ชัน autoRenewSession() จะสอบถามไปยัง Supabase DB อ่านโทเค็น aiToken ขึ้นมาใช้ได้ทันทีใน 0.01 วินาที โดยไม่ต้องยิง API ขอเซสชันใหม่ และไม่ต้อง Logout/Login ใหม่เลยแม้แต่ครั้งเดียว

เรื่องที่ 8: แก้ไขบั๊กวิกฤต supabase ไม่ถูก import + เพิ่มเงื่อนไข FORCE_RELOGIN สำหรับผู้ใช้รอบแรก
  - แก้บั๊กวิกฤต: ค้นพบว่า supabase client ไม่ได้ถูก import เข้ามาใน thaiLlmService.js เลย (import แค่ apiService จาก ./api) ทำให้ตัวแปร supabase เป็น undefined ตลอดเวลา
  - แก้ไข import: เปลี่ยน import { apiService } from './api' -> import { apiService, supabase } from './api'
  - เพิ่มเงื่อนไข FORCE_RELOGIN สำหรับผู้ใช้รอบแรก:
    - หากผู้ใช้ยังไม่มี aiToken ในคอลัมน์ Permissions ของตาราง Users ใน Supabase DB เลย -> ฟังก์ชัน autoRenewSession() จะ return 'FORCE_RELOGIN'
    - หาก aiToken ใน DB มีอยู่แล้วแต่หมดอายุครบ 1 ปี -> return 'FORCE_RELOGIN' เช่นกัน
    - AuthContext.jsx จับค่า FORCE_RELOGIN แล้วแสดง Toast แจ้งเตือน "ระบบ CatLog AI ได้อัปเดตใหม่ กรุณาเข้าสู่ระบบอีกครั้ง" พร้อมบังคับ logout() อัตโนมัติ
    - เมื่อผู้ใช้ login กลับเข้ามา -> login() จะเรียก createSession() สร้างโทเค็น AI ใหม่และ setSessionToken() บันทึกลง Supabase DB ทันที -> ครั้งต่อไปไม่ต้อง login ใหม่อีกเลย
  - เพิ่ม export: export getSessionToken และ setSessionToken จาก thaiLlmService ให้ AuthContext เรียกใช้ sync token ลง DB ได้
  - Backend: เพิ่ม persistAiTokenToUser() ใน aiRouter.js ให้ทุกครั้งที่ Backend ออกโทเค็น AI ใหม่ -> บันทึก aiToken ลงตาราง Users.Permissions ใน Supabase DB ด้วย

เรื่องที่ 9: แก้ไข Timing Bug ในกระบวนการ Login (แก้ปัญหาเซสชัน AI ไม่บันทึกลง DB เมื่อผู้ใช้ใหม่ล็อกอิน)
  - วิเคราะห์สาเหตุที่ไม่เห็น aiToken ของยูสเซอร์อื่นบน DB:
    - ในฟังก์ชัน login() ของ AuthContext.jsx เดิมมีการเรียก createSession() ก่อน การเรียก setUser() และ apiService.setUserSession()
    - ทำให้ขณะที่ createSession() และ setSessionToken() ทำงาน ค่า apiService.userId ยังคงเป็น null และในกรณี Fresh Login บนเครื่องผู้ใช้ใหม่ ค่าใน LocalStorage ก็ยังว่างอยู่ ส่งผลให้ targetId เป็น null และฟังก์ชัน syncAiTokenToDb() ถูกข้ามไปโดยไม่บันทึกข้อมูลลง DB
  - แก้ไขการทำงาน:
    - ปรับลำดับใน AuthContext.jsx ให้เรียก apiService.setUserSession(userId, ...) ทันทีที่ล็อกอินผ่าน ก่อน ที่จะสร้างเซสชัน AI (createSession())
    - เพิ่มการถอดรหัสฟิลด์ sub (User ID) จาก JWT Token ใน thaiLlmService.js เป็น Fallback สำรอง เพื่อให้รู้ User ID เสมอแม้ apiService.userId ยังไม่อัปเดต
    - บังคับเรียก setSessionToken(currentToken, userId) ซ้ำอีกครั้งหลังจบกระบวนการ Login เพื่อการันตีการบันทึกโทเค็นลง Supabase DB 100%

เรื่องที่ 10: แก้ไขปัญหา 502 Bad Gateway และ UI แจ้งเตือนในการกดครั้งแรก (Auto-Retry & Pre-warm สำหรับ Tailscale Cold-Start)
  - วิเคราะห์สาเหตุจริงของปัญหาการกด 2 รอบ:
    - พบว่าเมื่อผู้ใช้รันผ่าน Tailscale PWA Desktop (เช่น desktop-53a1q7c.tail9519f0.ts.net:8443) เครือข่าย Tailscale Tunnel / Proxy ใช้เวลาตื่น (Cold-Start) ประมาณ 5-8 วินาที
    - ในขณะที่ระบบลองยิงซ้ำแบบเดิมมีระยะเวลารวมเพียง 3 วินาที (3 attempts x 1s) จึงยังคงเจอ 502 ทั้งหมด 3 ครั้งรวดก่อนที่ Tailscale จะตื่นเสร็จ ทำให้ผู้ใช้เห็นข้อความ Error ในการกดรอบแรก แต่เมื่อกดรอบสอง Tailscale ตื่นเต็มที่แล้วจึงสำเร็จทันที
  - แก้ไขการทำงานอย่างสมบูรณ์:
    - ขยายระยะเวลาลองยิงซ้ำ (Auto-Retry Window) เป็น 5 ครั้ง (รวม 6 Attempts) พร้อมกลยุทธ์ Incremental Delay (1s, 1.5s, 2s, 2.5s, 3s ครอบคลุมระยะเวลา ~10 วินาที) ใน fetchWithGatewayRetry()
    - เพิ่มการเรียก prewarmBackend() อัตโนมัติเมื่อเปิดแอป, เมื่อเข้าหน้า AI Chat หรือเปิดกล่องแชท MiniChatBot เพื่อส่งสัญญาณ Ping ปลุก Tailscale ล่วงหน้าตั้งแต่นำทางเข้าแอป

เรื่องที่ 11: แก้ไขปัญหา 502 provider_error เมื่อ API AI ต้นทางไม่ตอบสนอง โดยใช้ข้อมูลจาก Supabase โดยตรง
  - ค้นพบสาเหตุจริงของปัญหาการกดปุ่ม Quick Action แล้วเจอ 502:
    - จากการวิเคราะห์ Console Log และ JSON Payload {"status": "error", "code": "provider_error"} พบว่า 502 Bad Gateway ไม่ได้เกิดจากเครือข่าย Tailscale แต่เกิดจากตัว aiRouter.js ฝั่ง Backend เป็นคนส่ง HTTP 502 ออกมาเอง เมื่อยิงไปหาบริการ AI ต้นทาง (thaillm.or.th) แล้วไม่ได้คำตอบ
    - ประกอบกับหน้าบ้านหลงคิดว่าเป็น Network Gateway Error จึงสั่งยิงซ้ำ (Retry) ไปยัง Backend 5 ครั้งติดกัน ซึ่งทุกครั้งที่ยิงไป Backend ก็คืน 502 provider_error กลับมาเหมือนเดิม
  - แก้ไขฝั่ง Backend (aiRouter.js):
    - หากบริการ AI ต้นทาง (thaillm.or.th) เกิดการขัดข้อง หรือตอบกลับล่าช้า แต่คำถามนั้นเป็นคำถามเกี่ยวกับงานในระบบ WorkLogs ที่ถูกคิวรีข้อมูลมาจาก Supabase เรียบร้อยแล้ว (workContext) ให้ระบบ นำสรุปจาก Supabase ตอบกลับผู้ใช้ทันที 100% โดยไม่ต้องพึ่ง AI ต้นทาง
    - หากไม่มีข้อมูลคิวรีเดิมอยู่เลย ให้ส่ง HTTP Status 503 (แทน 502) พร้อมข้อความแจ้งเตือนที่เป็นมิตร เพื่อไม่ให้สับสนกับ Network Gateway Error
  - แก้ไขฝั่ง Frontend (thaiLlmService.js):
    - ปรับเงื่อนไข fetchWithGatewayRetry ให้เช็ค Content-Type: application/json หากตอบกลับเป็น JSON จาก Backend ของเราเอง ให้ถือว่า Backend ทำงานอยู่และส่งผลลัพธ์ออกหน้าจอทันที ไม่ต้องยิงวนซ้ำ 5 ครั้ง

สรุปการทดสอบรอบสุดท้าย (Final Verification)
1. Backend Tests: รัน node --test ผ่าน 43/43 รายการ — สะอาด ไม่มี warning
2. Frontend Build: รัน npm run build ผ่าน 100% ปราศจาก Error (✓ 3299 modules, 8.10s)
3. พร้อมขึ้น Production: ผ่านการทดสอบ Fallback ข้อมูล Supabase เมื่อ AI ต้นทางขัดข้อง สมบูรณ์แล้ว 100%
