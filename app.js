import firebaseConfig from './firebase.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

console.log('🚀 تطبيق صحوة يبدأ التشغيل...');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// دالة مساعدة للحصول على عناصر DOM مع تحذير
const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) console.warn(`⚠️ العنصر "${id}" غير موجود في DOM`);
  return el;
};

// جمع كل العناصر
const dom = {
  authView: $('authView'),
  appView: $('appView'),
  loginTab: $('loginTab'),
  registerTab: $('registerTab'),
  loginForm: $('loginForm'),
  registerForm: $('registerForm'),
  loginEmail: $('loginEmail'),
  loginPassword: $('loginPassword'),
  registerNickname: $('registerNickname'),
  registerEmail: $('registerEmail'),
  registerPassword: $('registerPassword'),
  postForm: $('postForm'),
  postTitle: $('postTitle'),
  postContent: $('postContent'),
  feed: $('feed'),
  postsCount: $('postsCount'),
  commentsCount: $('commentsCount'),
  welcomeTitle: $('welcomeTitle'),
  welcomeText: $('welcomeText'),
  logoutBtn: $('logoutBtn'),
  refreshBtn: $('refreshBtn'),
  themeToggle: $('themeToggle'),
  toast: $('toast'),
  fabBtn: $('fabBtn'),
  postModal: $('postModal'),
  closeModalBtn: $('closeModalBtn')
};

// التحقق من العناصر الحرجة
const criticalMissing = !dom.loginForm || !dom.registerForm || !dom.authView || !dom.appView;
if (criticalMissing) {
  console.error('❌ عناصر DOM أساسية مفقودة! تأكد من وجودها في index.html');
} else {
  console.log('✅ جميع عناصر DOM موجودة');
}

// حالة التطبيق
const state = {
  user: null,
  profile: null,
  posts: [],
  theme: localStorage.getItem('sahwa-theme') || 'dark',
  listeners: new Map(),
  loading: false,
  postsUnsubscribe: null
};

// ----- الثيم -----
document.documentElement.setAttribute('data-theme', state.theme);
updateThemeButton();

function updateThemeButton() {
  if (!dom.themeToggle) return;
  const isDark = state.theme === 'dark';
  dom.themeToggle.setAttribute('aria-label', isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن');
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('sahwa-theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButton();
}

function toggleTheme() {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

// ----- دوال مساعدة -----
function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function timeLabel(input) {
  if (!input?.toDate) return 'الآن';
  const date = input.toDate();
  return new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function showToast(message, type = 'success') {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  dom.toast.className = `toast show ${type}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    dom.toast.className = 'toast';
  }, 2400);
}

function setLoading(flag) {
  state.loading = flag;
  if (dom.logoutBtn) dom.logoutBtn.disabled = flag;
  if (dom.refreshBtn) dom.refreshBtn.disabled = flag;
}

function switchAuthTab(tab) {
  const login = tab === 'login';
  if (dom.loginTab) dom.loginTab.classList.toggle('active', login);
  if (dom.registerTab) dom.registerTab.classList.toggle('active', !login);
  if (dom.loginForm) dom.loginForm.classList.toggle('hidden', !login);
  if (dom.registerForm) dom.registerForm.classList.toggle('hidden', login);
}

async function loadProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    state.profile = snap.exists() ? snap.data() : null;
  } catch (error) {
    console.error('خطأ في تحميل الملف الشخصي:', error);
    state.profile = null;
  }
}

function clearListeners() {
  for (const unsubscribe of state.listeners.values()) {
    try { unsubscribe(); } catch {}
  }
  state.listeners.clear();
}

function setVisibleView(authed) {
  if (dom.authView) dom.authView.classList.toggle('hidden', authed);
  if (dom.appView) dom.appView.classList.toggle('hidden', !authed);
  if (dom.logoutBtn) dom.logoutBtn.classList.toggle('hidden', !authed);
}

function updateSummary() {
  if (dom.postsCount) dom.postsCount.textContent = String(state.posts.length);
  const totalComments = state.posts.reduce((sum, post) => sum + (post.commentCount || 0), 0);
  if (dom.commentsCount) dom.commentsCount.textContent = String(totalComments);
  const nickname = state.profile?.nickname || state.user?.displayName || 'صديقنا';
  if (dom.welcomeTitle) dom.welcomeTitle.textContent = `أهلاً، ${nickname}`;
  if (dom.welcomeText) dom.welcomeText.textContent = 'يمكنك الآن كتابة منشور جديد أو التفاعل مع منشورات الآخرين.';
}

// ----- المودال -----
function openModal() {
  if (!dom.postModal) return;
  console.log('📝 فتح المودال');
  dom.postModal.classList.remove('hidden');
  setTimeout(() => {
    if (dom.postTitle) dom.postTitle.focus();
  }, 100);
}

function closeModal() {
  if (!dom.postModal) return;
  console.log('📝 إغلاق المودال');
  dom.postModal.classList.add('hidden');
  if (dom.postForm) dom.postForm.reset();
}

function handleModalClick(event) {
  if (event.target === dom.postModal) {
    closeModal();
  }
}

// ----- دوال التفاعل مع Firebase -----
async function toggleLike(postId) {
  const user = auth.currentUser;
  if (!user) throw new Error('غير مسجل دخول');

  const postRef = doc(db, 'posts', postId);
  const likeRef = doc(db, 'posts', postId, 'likes', user.uid);

  await runTransaction(db, async (transaction) => {
    const likeSnap = await transaction.get(likeRef);
    if (likeSnap.exists()) {
      transaction.delete(likeRef);
    } else {
      transaction.set(likeRef, {
        userId: user.uid,
        createdAt: serverTimestamp()
      });
    }
  });
}

async function addComment(postId, text) {
  const user = auth.currentUser;
  if (!user) throw new Error('غير مسجل دخول');

  await addDoc(collection(db, 'posts', postId, 'comments'), {
    authorId: user.uid,
    authorName: state.profile?.nickname || user.displayName || 'مستخدم',
    text,
    createdAt: serverTimestamp()
  });
  showToast('تمت إضافة التعليق.');
}

async function createPost(title, content) {
  const user = auth.currentUser;
  if (!user) throw new Error('غير مسجل دخول');

  await addDoc(collection(db, 'posts'), {
    authorId: user.uid,
    authorName: state.profile?.nickname || user.displayName || 'مستخدم',
    title,
    content,
    createdAt: serverTimestamp()
  });
  showToast('تم نشر المنشور.');
}

// ----- إنشاء بطاقة المنشور -----
function createPostCard(post) {
  const article = document.createElement('article');
  article.className = 'post-card';
  article.dataset.postId = post.id;

  article.innerHTML = `
    <div class="post-top">
      <div>
        <h3 class="post-title">${escapeHtml(post.title)}</h3>
        <div class="post-meta">بواسطة <strong>${escapeHtml(post.authorName || 'مستخدم')}</strong> • <span class="post-date">${timeLabel(post.createdAt)}</span></div>
      </div>
      <button class="ghost-btn delete-post-btn hidden" type="button">حذف</button>
    </div>

    <p class="post-content">${escapeHtml(post.content)}</p>

    <div class="post-actions">
      <button class="action-btn primary-like like-btn" type="button">إعجاب <span class="like-count">0</span></button>
      <button class="action-btn comments-toggle" type="button">التعليقات <span class="comment-count">0</span></button>
    </div>

    <section class="comments hidden">
      <h4>التعليقات</h4>
      <div class="comments-list"></div>
      <form class="comment-form">
        <div class="row">
          <input type="text" maxlength="500" placeholder="اكتب تعليقاً..." required />
          <button type="submit">إرسال</button>
        </div>
      </form>
    </section>
  `;

  // حذف المنشور
  const deleteBtn = article.querySelector('.delete-post-btn');
  if (state.user?.uid === post.authorId) {
    deleteBtn.classList.remove('hidden');
    deleteBtn.addEventListener('click', async () => {
      try {
        await deleteDoc(doc(db, 'posts', post.id));
        showToast('تم حذف المنشور.');
      } catch (error) {
        console.error(error);
        showToast('تعذر حذف المنشور.', 'error');
      }
    });
  }

  // الإعجاب
  const likeBtn = article.querySelector('.like-btn');
  const likeCount = article.querySelector('.like-count');

  likeBtn.addEventListener('click', async () => {
    if (!state.user) {
      showToast('يجب تسجيل الدخول أولاً', 'error');
      return;
    }
    try {
      await toggleLike(post.id);
    } catch (error) {
      console.error(error);
      showToast('تعذر تحديث الإعجاب.', 'error');
    }
  });

  // التعليقات
  const commentsToggle = article.querySelector('.comments-toggle');
  const commentsSection = article.querySelector('.comments');
  const commentCount = article.querySelector('.comment-count');
  const commentsList = article.querySelector('.comments-list');
  const commentForm = article.querySelector('.comment-form');
  const commentInput = commentForm.querySelector('input');

  commentsToggle.addEventListener('click', () => {
    commentsSection.classList.toggle('hidden');
  });

  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = commentInput.value.trim();
    if (!text) return;
    try {
      await addComment(post.id, text);
      commentInput.value = '';
    } catch (error) {
      console.error(error);
      showToast('تعذر إرسال التعليق.', 'error');
    }
  });

  // استماع التحديثات
  const likesRef = collection(db, 'posts', post.id, 'likes');
  const commentsRef = collection(db, 'posts', post.id, 'comments');

  const likesUnsub = onSnapshot(likesRef, (snapshot) => {
    likeCount.textContent = String(snapshot.size);
    const liked = snapshot.docs.some((docSnap) => docSnap.id === state.user?.uid);
    likeBtn.classList.toggle('liked', liked);
    likeBtn.innerHTML = liked ? 'إلغاء الإعجاب ' : 'إعجاب ';
    const countSpan = document.createElement('span');
    countSpan.className = 'like-count';
    countSpan.textContent = String(snapshot.size);
    likeBtn.appendChild(countSpan);
  });

  const commentsUnsub = onSnapshot(query(commentsRef, orderBy('createdAt', 'asc')), (snapshot) => {
    commentCount.textContent = String(snapshot.size);
    commentsList.innerHTML = '';
    if (snapshot.empty) {
      commentsList.innerHTML = '<div class="comment-empty">لا توجد تعليقات بعد.</div>';
    } else {
      snapshot.forEach((commentDoc) => {
        const comment = commentDoc.data();
        const item = document.createElement('div');
        item.className = 'comment-item';
        item.innerHTML = `
          <div class="comment-author">${escapeHtml(comment.authorName || 'مستخدم')}</div>
          <div class="comment-text">${escapeHtml(comment.text || '')}</div>
          <div class="comment-meta">${timeLabel(comment.createdAt)}</div>
        `;
        commentsList.appendChild(item);
      });
    }
    state.posts = state.posts.map((item) => item.id === post.id ? { ...item, commentCount: snapshot.size } : item);
    updateSummary();
  });

  state.listeners.set(`likes-${post.id}`, likesUnsub);
  state.listeners.set(`comments-${post.id}`, commentsUnsub);
  return article;
}

// ----- عرض المنشورات -----
async function renderPosts(posts) {
  clearListeners();
  if (!dom.feed) return;

  dom.feed.innerHTML = '';
  if (!posts.length) {
    dom.feed.innerHTML = `
      <article class="post-card">
        <div class="comment-empty">لا توجد منشورات بعد. كن أول من ينشر شيئاً.</div>
      </article>
    `;
    return;
  }

  posts.forEach((post) => {
    const card = createPostCard(post);
    dom.feed.appendChild(card);
  });
}

function observePosts() {
  if (state.postsUnsubscribe) {
    state.postsUnsubscribe();
    state.postsUnsubscribe = null;
  }

  const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
  state.postsUnsubscribe = onSnapshot(postsQuery, async (snapshot) => {
    const posts = snapshot.docs.map((postDoc) => {
      const data = postDoc.data();
      return {
        id: postDoc.id,
        ...data,
        commentCount: 0
      };
    });

    state.posts = posts;
    updateSummary();
    await renderPosts(posts);
  }, (error) => {
    console.error('خطأ في تحميل المنشورات:', error);
    showToast('تعذر تحميل المنشورات.', 'error');
  });
}

// ============= ربط الأحداث =============
console.log('🔄 جاري ربط الأحداث...');

// تبديل الثيم
if (dom.themeToggle) {
  dom.themeToggle.addEventListener('click', toggleTheme);
  console.log('✅ تم ربط زر الثيم');
}

// تبديل تبويبات الدخول
if (dom.loginTab) {
  dom.loginTab.addEventListener('click', () => switchAuthTab('login'));
  console.log('✅ تم ربط تبويب تسجيل الدخول');
}
if (dom.registerTab) {
  dom.registerTab.addEventListener('click', () => switchAuthTab('register'));
  console.log('✅ تم ربط تبويب إنشاء حساب');
}

// فتح وإغلاق المودال
if (dom.fabBtn) {
  dom.fabBtn.addEventListener('click', openModal);
  console.log('✅ تم ربط زر النشر العائم');
}
if (dom.closeModalBtn) {
  dom.closeModalBtn.addEventListener('click', closeModal);
  console.log('✅ تم ربط زر إغلاق المودال');
}
if (dom.postModal) {
  dom.postModal.addEventListener('click', handleModalClick);
}

// تسجيل الدخول
if (dom.loginForm) {
  dom.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, dom.loginEmail.value.trim(), dom.loginPassword.value);
      dom.loginForm.reset();
      showToast('تم تسجيل الدخول.');
    } catch (error) {
      console.error(error);
      showToast('فشل تسجيل الدخول. تحقق من البيانات.', 'error');
    } finally {
      setLoading(false);
    }
  });
  console.log('✅ تم ربط نموذج تسجيل الدخول');
}

// إنشاء حساب
if (dom.registerForm) {
  dom.registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nickname = dom.registerNickname.value.trim();
    const email = dom.registerEmail.value.trim();
    const password = dom.registerPassword.value;
    setLoading(true);

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: nickname });
      await setDoc(doc(db, 'users', credential.user.uid), {
        nickname,
        email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      dom.registerForm.reset();
      showToast('تم إنشاء الحساب.');
    } catch (error) {
      console.error(error);
      showToast('تعذر إنشاء الحساب. تأكد من البيانات.', 'error');
    } finally {
      setLoading(false);
    }
  });
  console.log('✅ تم ربط نموذج إنشاء الحساب');
}

// إنشاء منشور
if (dom.postForm) {
  dom.postForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = dom.postTitle.value.trim();
    const content = dom.postContent.value.trim();

    if (!title || !content) {
      showToast('الرجاء كتابة عنوان ومحتوى.', 'error');
      return;
    }

    setLoading(true);
    try {
      await createPost(title, content);
      dom.postForm.reset();
      closeModal();
    } catch (error) {
      console.error(error);
      showToast('تعذر نشر المنشور.', 'error');
    } finally {
      setLoading(false);
    }
  });
  console.log('✅ تم ربط نموذج إنشاء المنشور');
}

// تسجيل الخروج
if (dom.logoutBtn) {
  dom.logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      showToast('تم تسجيل الخروج.');
    } catch (error) {
      console.error(error);
      showToast('تعذر تسجيل الخروج.', 'error');
    }
  });
  console.log('✅ تم ربط زر الخروج');
}

// تحديث المنشورات
if (dom.refreshBtn) {
  dom.refreshBtn.addEventListener('click', () => {
    observePosts();
    showToast('تم تحديث المنشورات.');
  });
  console.log('✅ تم ربط زر التحديث');
}

// ============= مراقبة حالة المصادقة =============
onAuthStateChanged(auth, async (user) => {
  console.log('🔐 تغيرت حالة المصادقة:', user ? 'مسجل دخول' : 'غير مسجل');
  state.user = user || null;

  if (state.postsUnsubscribe) {
    state.postsUnsubscribe();
    state.postsUnsubscribe = null;
  }
  clearListeners();

  if (!user) {
    state.profile = null;
    state.posts = [];
    if (dom.feed) dom.feed.innerHTML = '';
    updateSummary();
    setVisibleView(false);
    return;
  }

  try {
    await loadProfile(user.uid);
    setVisibleView(true);
    observePosts();
    updateSummary();
  } catch (error) {
    console.error(error);
    showToast('تعذر تحميل ملفك الشخصي.', 'error');
  }
});

// التهيئة الأولية
switchAuthTab('login');
setVisibleView(false);
console.log('✅ تم تهيئة التطبيق بنجاح');
