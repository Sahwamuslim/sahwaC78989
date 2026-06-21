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
  updateDoc,
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
  toast: document.getElementById('toast')
};

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

async function toggleLike(postId) {
  const user = auth.currentUser;
  if (!user) throw new Error('not-authenticated');

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
  if (!user) throw new Error('not-authenticated');

  await addDoc(collection(db, 'posts', postId, 'comments'), {
    authorId: user.uid,
    authorName: state.profile?.nickname || user.displayName || 'مستخدم',
    text,
    createdAt: serverTimestamp()
  });
  toast('تمت إضافة التعليق.');
}

async function createPost(title, content) {
  const user = auth.currentUser;
  if (!user) throw new Error('not-authenticated');

  await addDoc(collection(db, 'posts'), {
    authorId: user.uid,
    authorName: state.profile?.nickname || user.displayName || 'مستخدم',
    title,
    content,
    createdAt: serverTimestamp()
  });
  toast('تم نشر المنشور.');
}

async function removeCurrentListenersAndRender(posts) {
  clearListeners();
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
  const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
  return onSnapshot(postsQuery, async (snapshot) => {
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
    await removeCurrentListenersAndRender(posts);
  }, (error) => {
    console.error(error);
    toast('تعذر تحميل المنشورات.', 'error');
  });
}

let stopPostsObserver = null;

dom.loginTab.addEventListener('click', () => switchAuthTab('login'));
dom.registerTab.addEventListener('click', () => switchAuthTab('register'));
dom.themeToggle.addEventListener('click', toggleTheme);
dom.refreshBtn.addEventListener('click', () => {
  if (typeof stopPostsObserver === 'function') {
    stopPostsObserver();
    stopPostsObserver = observePosts();
    toast('تم تحديث المنشورات.');
  }
});

dom.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setLoading(true);
  try {
    await signInWithEmailAndPassword(auth, dom.loginEmail.value.trim(), dom.loginPassword.value);
    dom.loginForm.reset();
    toast('تم تسجيل الدخول.');
  } catch (error) {
    console.error(error);
    toast('فشل تسجيل الدخول. تحقق من البيانات.', 'error');
  } finally {
    setLoading(false);
  }
});

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
    toast('تم إنشاء الحساب.');
  } catch (error) {
    console.error(error);
    toast('تعذر إنشاء الحساب. تأكد من البيانات.', 'error');
  } finally {
    setLoading(false);
  }
});

dom.postForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = dom.postTitle.value.trim();
  const content = dom.postContent.value.trim();

  if (!title || !content) {
    toast('الرجاء كتابة عنوان ومحتوى.', 'error');
    return;
  }

  setLoading(true);
  try {
    await createPost(title, content);
    dom.postForm.reset();
  } catch (error) {
    console.error(error);
    toast('تعذر نشر المنشور.', 'error');
  } finally {
    setLoading(false);
  }
});

dom.logoutBtn.addEventListener('click', async () => {
  try {
    await signOut(auth);
    toast('تم تسجيل الخروج.');
  } catch (error) {
    console.error(error);
    toast('تعذر تسجيل الخروج.', 'error');
  }
});

onAuthStateChanged(auth, async (user) => {
  state.user = user || null;
  if (stopPostsObserver) {
    stopPostsObserver();
    stopPostsObserver = null;
  }
  clearListeners();

  if (!user) {
    state.profile = null;
    state.posts = [];
    dom.feed.innerHTML = '';
    updateSummary();
    setVisibleView(false);
    return;
  }

  try {
    await loadProfile(user.uid);
    setVisibleView(true);
    stopPostsObserver = observePosts();
    updateSummary();
  } catch (error) {
    console.error(error);
    toast('تعذر تحميل ملفك الشخصي.', 'error');
  }
});

switchAuthTab('login');
setVisibleView(false);
