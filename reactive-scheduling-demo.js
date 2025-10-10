// --- 全局变量和数据结构 ---
let activeEffect;
const effectStack = [];
const bucket = new WeakMap();

// 任务队列，用 Set 自动去重
const jobQueue = new Set();
// 一个标志位，防止重复刷新
let isFlushing = false;

// --- 核心函数 ---
function reactive(obj) {
  return new Proxy(obj, {
    get(target, key) {
      track(target, key);
      return target[key];
    },
    set(target, key, value) {
      target[key] = value;
      trigger(target, key); // set 时触发 trigger
      return true;
    }
  });
}

function track(target, key) {
  if (!activeEffect) return;
  let depsMap = bucket.get(target);
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()));
  }
  let deps = depsMap.get(key);
  if (!deps) {
    depsMap.set(key, (deps = new Set()));
  }
  deps.add(activeEffect);
  activeEffect.deps.push(deps);
}

function trigger(target, key) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const effects = depsMap.get(key);
  if (!effects) return;

  const effectsToRun = new Set();
  effects.forEach(effectFn => {
    // 避免无限递归
    if (effectFn !== activeEffect) {
      effectsToRun.add(effectFn);
    }
  });

  effectsToRun.forEach(effectFn => {
    // 如果用户提供了自定义调度器，则优先使用
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      // 否则，使用我们默认的基于微任务的调度逻辑
      // 将副作用函数添加到任务队列
      jobQueue.add(effectFn);
      // 安排刷新任务
      flushJob();
    }
  });
}

/**
 * 新增：刷新任务队列的函数
 */
function flushJob() {
  // 如果正在刷新，则什么也不做
  if (isFlushing) return;
  isFlushing = true;

  // 使用 Promise.resolve() 创建一个微任务，在微任务中刷新队列
  Promise.resolve()
    .then(() => {
      // 遍历并执行队列中的所有任务
      jobQueue.forEach(job => job());
    })
    .finally(() => {
      // 刷新完毕后，重置标志位并清空队列
      isFlushing = false;
      jobQueue.clear();
    });
}

function effect(fn, options = {}) {
  const effectFn = () => {
    cleanup(effectFn);
    activeEffect = effectFn;
    effectStack.push(effectFn);
    fn();
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
  };
  effectFn.options = options;
  effectFn.deps = [];
  effectFn();
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i];
    deps.delete(effectFn);
  }
  effectFn.deps.length = 0;
}


console.log("--- 1. 基本用法 ---");
// a. 创建一个原始对象
const data = { text: 'Hello', count: 0 };
// b. 将其变为响应式对象
const obj = reactive(data);

// c. 使用 effect 注册一个副作用函数，它会依赖 obj.text
effect(() => {
  console.log('Effect 1 (text) is running:', obj.text);
});

// d. 修改响应式对象的属性，这会触发上面的 effect 重新执行
console.log('修改 obj.text...');
obj.text = 'Hello, World!';


console.log("\n--- 2. 异步批量更新 ---");
// a. 注册一个依赖于 obj.count 的 effect
effect(() => {
  console.log('Effect 2 (count) is running:', obj.count);
});

// b. 在同一个事件循环中多次修改 obj.count
console.log('连续两次增加 count...');
obj.count++;
obj.count++;
console.log('同步代码执行完毕，更新将在微任务中执行。');


setTimeout(() => {
  console.log("\n--- 3. 自定义调度器 (scheduler) ---");
  // a. 创建一个响应式对象
  const data3 = { value: 1 };
  const obj3 = reactive(data3);

  // b. 注册一个带有 scheduler 的 effect
  effect(() => {
    console.log('Effect 3 (scheduler) is running:', obj3.value);
  }, {
    // 当依赖变化时，不会直接执行副作用函数，而是执行这个 scheduler
    scheduler(fn) {
      console.log('Scheduler is called!');
      // 我们可以决定何时以及如何执行原始的副作用函数 (fn)
      // 例如，我们可以在 1 秒后执行它
      setTimeout(fn, 1000);
    }
  });

  // c. 修改数据
  console.log('修改 obj3.value...');
  obj3.value++;
  console.log('同步代码执行完毕，等待 scheduler...');
  // 预期：会先打印 'Scheduler is called!'，然后大约 1 秒后打印 'Effect 4 (scheduler) is running: 2'
}, 200);
