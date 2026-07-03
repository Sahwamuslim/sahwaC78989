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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// تأكد من وجود جميع العناصر
const dom = {
  authView: document.getElementById('authView'),
  appView: document.getElementById('appView'),
  loginTab: document.getElementById('loginTab'),
  registerTab: document.getElementById('registerTab'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  registerNickname: document.getElementById('registerNickname'),
  registerEmail: document.getElementById('registerEmail'),
  registerPassword: document.getElementById('registerPassword'),
  postForm: document.getElementById('postForm'),
  postTitle: document.getElementById('postTitle'),
  postContent: document.getElementById('postContent'),
  feed: document.getElementById('feed'),
  postsCount: document.getElementById('postsCount'),
  commentsCount: document.getElementById('commentsCount'),
  welcomeTitle: document.getElementById('welcomeTitle'),
  welcomeText: document.getElementById('welcomeText'),
  logoutBtn: document.getElementById('logoutBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  themeToggle: document.getElementById('themeToggle'),
  toast: document.getElementById('toast'),
  fabBtn: document.getElementById('fabBtn'),
  postModal: document.getElementById('postModal'),
  closeModalBtn: document.getElementById('closeModalBtn')
};

// التحقق من وجود العناصر الأساسية
console.log('DOM Elements:', {
  fabBtn: dom.fabBtn,
  postModal: dom.postModal,
  closeModalBtn: dom.closeModalBtn
});

const state = {
  user: null,
  profile: null,
  posts: [],
  theme: localStorage.getItem('sahwa-theme') || 'dark',
  listeners: new Map(),
  loading: false
};

document.documentElement.setAttribute('data-theme', state.theme);
syncThemeButton();

function syncThemeButton() {
  const isDark = state.theme === 'dark';
  dom.themeToggle.setAttribute('aria-label', isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن');
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('sahwa-theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  syncThemeButton();
}

function toggleTheme() {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

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

function toast(message, type = 'success') {
  dom.toast.textContent = message;
  dom.toast.className = `toast show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    dom.toast.className = 'toast';
  }, 2400);
}

function setLoading(flag) {
  state.loading = flag;
  dom.logoutBtn.disabled = flag;
  dom.refreshBtn.disabled = flag;
}

function switchAuthTab(tab) {
  const login = tab === 'login';
  dom.loginTab.classList.toggle('active', login);
  dom.registerTab.classList.toggle('active', !login);
  dom.loginForm.classList.toggle('hidden', !login);
  dom.registerForm.classList.toggle('hidden', login);
}

async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  state.profile = snap.exists() ? snap.data() : null;
}

function clearListeners() {
  for (const unsubscribe of state.listeners.values()) {
    try { unsubscribe(); } catch {}
  }
  state.listeners.clear();
}

function setVisibleView(authed) {
  dom.authView.classList.toggle('hidden', authed);
  dom.appView.classList.toggle('hidden', !authed);
  dom.logoutBtn.classList.toggle('hidden', !authed);
}

function updateSummary() {
  dom.postsCount.textContent = String(state.posts.length);
  const totalComments = state.posts.reduce((sum, post) => sum + (post.commentCount || 0), 0);
  dom.commentsCount.textContent = String(totalComments);
  const nickname = state.profile?.nickname || state.user?.displayName || 'صديقنا';
  dom.welcomeTitle.textContent = `أهلاً، ${nickname}`;
  dom.welcomeText.textContent = 'يمكنك الآن كتابة منشور جديد أو التفاعل مع منشورات الآخرين.';
}

function openModal() {
  console.log('Opening modal');
  dom.postModal.classList.remove('hidden');
  // تأخير بسيط لضمان ظهور المودال قبل التركيز
  setTimeout(() => {
    dom.postTitle.focus();
  }, 100);
}

function closeModal() {
  console.log('Closing modal');
  dom.postModal.classList.add('hidden');
  dom.postForm.reset();
}

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
        <label class="sr-only" for="comment-${post.id}">إضافة تعليق</label>
        <div class="row">
          <input id="comment-${post.id}" name="comment" type="text" maxlength="500" placeholder="اكتب تعليقاً..." required />
          <button type="submit">إرسال</button>
        </div>
      </form>
    </section>
  `;

  const deleteBtn = article.querySelector('.delete-post-btn');
  if (state.user?.uid === post.authorId) {
    deleteBtn.classList.remove('hidden');
    deleteBtn.addEventListener('click', async () => {
      try {
        await deleteDoc(doc(db, 'posts', post.id));
        toast('تم حذف المنشور.');
      } catch (error) {
        console.error(error);
        toast('تعذر حذف المنشور.', 'error');
      }
    });
  }

  const likeBtn = article.querySelector('.like-btn');
  const commentsToggle = article.querySelector('.comments-toggle');
  const commentsSection = article.querySelector('.comments');
  const commentsList = article.querySelector('.comments-list');
  const commentCount = article.querySelector('.comment-count');
  const likeCount = article.querySelector('.like-count');
  const commentForm = article.querySelector('.comment-form');
  const commentInput = article.querySelector('input[name="comment"]');

  commentsToggle.addEventListener('click', () => {
    commentsSection.classList.toggle('hidden');
  });

  likeBtn.addEventListener('click', async () => {
    if (!state.user) return;
    try {
      await toggleLike(post.id);
    } catch (error) {
      console.error(error);
      toast('تعذر تحديث الإعجاب.', 'error');
    }
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
      toast('تعذر إرسال التعليق.', 'error');
    }
  });

  const likesRef = collection(db, 'posts', post.id, 'likes');
  const commentsRef = collection(db, 'posts', post.id, 'comments');

  const likesUnsub = onSnapshot(likesRef, (snapshot) => {
    likeCount.textContent = String(snapshot.size);
    const liked = snapshot.docs.some((docSnap) => docSnap.id === state.user?.uid);
    likeBtn.classList.toggle('liked', liked);
    likeBtn.textContent = liked ? 'إلغاء الإعجاب ' : 'إعجاب ';
    const countSpan = document.createElement('span');
    countSpan.className = 'like-count';
    countSpan.textContent = String(snapshot.size);
    likeBtn.appendChild(countSpan);
  });

  const
