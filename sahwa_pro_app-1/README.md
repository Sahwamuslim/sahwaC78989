# صحوة

واجهة منشورات عربية تعمل على GitHub Pages مع Firebase.

## المزايا
- تسجيل دخول وإنشاء حساب
- اسم مستعار فقط داخل الواجهة
- نشر المنشورات
- الإعجاب والإلغاء
- التعليقات
- وضع فاتح وداكن
- تصميم متجاوب

## الملفات
- `index.html`
- `style.css`
- `app.js`
- `firebase.js`
- `firestore.rules`

## التشغيل
1. أنشئ مشروع Firebase.
2. فعّل Authentication عبر Email/Password.
3. أنشئ Firestore.
4. افتح `firebase.js` والصق بيانات مشروعك بدل القيم الافتراضية.
5. ارفع الملفات إلى GitHub Pages.
6. ارفع قواعد Firestore من `firestore.rules`.

## بنية البيانات
### users/{uid}
```json
{
  "nickname": "اسم مستعار",
  "email": "user@example.com",
  "createdAt": "serverTimestamp"
}
```

### posts/{postId}
```json
{
  "authorId": "uid",
  "authorName": "اسم مستعار",
  "title": "عنوان المنشور",
  "content": "المحتوى",
  "createdAt": "serverTimestamp"
}
```

### posts/{postId}/likes/{uid}
```json
{
  "userId": "uid",
  "createdAt": "serverTimestamp"
}
```

### posts/{postId}/comments/{commentId}
```json
{
  "authorId": "uid",
  "authorName": "اسم مستعار",
  "text": "التعليق",
  "createdAt": "serverTimestamp"
}
```

## ملاحظة
لا تنسَ استبدال قيم Firebase داخل `firebase.js`.
