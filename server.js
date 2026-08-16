const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'nevo_secret',
  resave: false,
  saveUninitialized: false
}));

// حماية للعملاء
function requireCustomer(req, res, next) {
  if (req.session.isCustomer) return next();
  res.redirect('/login.html');
}

// حماية الأدمن
function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.status(403).send("غير مسموح لك بالوصول لهذه الصفحة.");
}

// تسجيل دخول الأدمن
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
});

// صفحة لوحة الأدمن
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// مسارات OAuth والذكاء الاصطناعي والتذاكر
app.get('/auth/discord', (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.members.read`;
  res.redirect(url);
});

app.get('/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("فشل تسجيل الدخول");

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.REDIRECT_URI,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const accessToken = tokenResponse.data.access_token;
    const memberResponse = await axios.get(`https://discord.com/api/v10/users/@me/guilds/${process.env.GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const roles = memberResponse.data.roles;
    if (roles.includes(process.env.CLIENT_ROLE_ID)) {
      req.session.isCustomer = true;
      req.session.user = memberResponse.data.user;
      res.redirect('/');
    } else {
      res.send("عذراً، يجب أن تحمل رتبة عميل في سيرفر الديسكورد للوصول للموقع.");
    }
  } catch (error) {
    res.status(500).send("حدث خطأ أثناء التحقق من الرتبة.");
  }
});

app.post('/api/ai-support', requireCustomer, async (req, res) => {
  const { prompt } = req.body;
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت مساعد دعم فني لمتجر NEVO STORE للودرات الألعاب. أجب بإيجاز ودقة لحل المشكلة التقنية." },
        { role: "user", content: prompt }
      ]
    }, {
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
    });

    res.json({ reply: response.data.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: "فشل معالجة الطلب." });
  }
});

app.post('/api/tickets', requireCustomer, async (req, res) => {
  const { username, contactInfo, subject, category, description } = req.body;
  try {
    await axios.post(process.env.DISCORD_WEBHOOK_URL, {
      embeds: [{
        title: `🎟️ تذكرة جديدة: ${subject}`,
        color: 0xd0d5dd,
        fields: [
          { name: 'المستخدم', value: username, inline: true },
          { name: 'التواصل', value: contactInfo, inline: true },
          { name: 'القسم', value: category, inline: true },
          { name: 'الوصف', value: description }
        ],
        footer: { text: `NEVO STORE Ticket System` }
      }]
    });
    res.json({ success: true, message: 'تم إرسال التذكرة بنجاح!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ في الإرسال.' });
  }
});

app.use(express.static('public'));

app.get('/', requireCustomer, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(3000, () => console.log('NEVO STORE Running on http://localhost:3000'));