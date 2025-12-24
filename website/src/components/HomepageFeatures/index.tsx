import type { ReactNode } from 'react';
import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  image: string;
  description: ReactNode;
  reverse?: boolean;
  tags?: string[];
  buttons?: { label: string; to: string; type?: 'primary' | 'secondary' }[];
};

const FeatureList: FeatureItem[] = [
  {
    title: '核心 IM 平台',
    image: 'https://placehold.co/600x400/5865F2/white?text=Mew',
    tags: ['隐私优先', '实时通信'],
    description: (
      <>
        <p>
          核心平台提供强大高效的消息传输和存储。它采用了经典的 Server - Category - Channel 三层拓扑结构，支持基本消息类型、回应和带有多个面板的群组通信。
        </p>
        <p>
          该系统被设计为一个纯粹的消息中心，与其处理的内容解耦，确保了高性能和可靠性。
        </p>
        <p>
          平台本身保持高度纯粹，专注于提供低延迟的消息传输、持久化存储以及富文本（Markdown、代码高亮、多媒体）渲染能力。数据完全私有化，你的数据只属于你。
        </p>
      </>
    ),
  },
  {
    title: 'Bot 生态系统',
    image: 'https://placehold.co/600x400/5865F2/white?text=Mew',
    reverse: true,
    tags: ['Webhook', 'WebSocket', 'AI Native'],
    description: (
      <>
        <p>
          这是 Mew 的灵魂所在。我们将业务逻辑从核心平台彻底解耦，转化为一个个独立的 Bot 服务。Bot 可以通过 Webhook（单向推送）或 Socket.IO（双向会话）接入平台。
        </p>
        <p>
          这允许从简单的通知集成到复杂的交互式应用的无限扩展。例如：
        </p>

        <ul className="list-disc list-inside my-2 space-y-1 text-gray-500 dark:text-gray-400">
          <li>
            <strong>Fetcher Bots</strong>：聚合来自 RSS、X、Bilibili 等外部信息流，并通过 Webhook 投递到频道。
          </li>
          <li>
            <strong>Agent Bots</strong>：作为长连接客户端监听事件（如 <code>MESSAGE_CREATE</code>），实现指令、对话、运维自动化（可选：接入 LLM）。
          </li>
        </ul>
      </>
    ),
    buttons: [
      { label: '了解更多', to: '/docs/guide/platform-design', type: 'secondary' },
    ],
  },
  {
    title: '内置 RBAC',
    image: 'https://placehold.co/600x400/5865F2/white?text=Mew',
    tags: ['Token 认证', '精细化控制'],
    description: (
      <>
        <p>
          核心内置了一个精细的基于角色的访问控制（RBAC）系统。权限通过角色分配和权限点的组合进行管理。
        </p>
        <p>
          该系统被设计为可扩展的，允许插件和机器人无缝地集成它们自己的权限需求。
        </p>
        <p>你可以精确控制每个 Bot 的“视野”——决定它们能读取哪些频道、能否在特定服务器发言。这不仅保障了数据安全，也防止了 Bot 之间的逻辑冲突，确保系统的稳定运行。</p>
      </>
    ),
    buttons: [
      { label: '了解更多', to: '/docs/guide/platform-design', type: 'secondary' },
    ],
  },
  {
    title: '现代技术栈',
    image: 'https://placehold.co/600x400/5865F2/white?text=Mew',
    reverse: true,
    tags: ['TypeScript', 'Docker', 'React'],
    description: (
      <>
        <p>
          Mew 建立在现代、高性能的 Web 技术之上，旨在提供卓越的开发体验和用户体验：
        </p>
        <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400">
          <div>🚀 <strong>Server:</strong> Express + Socket.IO + MongoDB（附件使用 S3 兼容存储，例如 Garage）。</div>
          <div>✨ <strong>Client:</strong> React + Vite + TanStack Query + Zustand + TipTap。</div>
          <div>📦 <strong>DevOps:</strong> Docker Compose 一键启动（可选 GHCR 预构建镜像）。</div>
        </div>
      </>
    ),
    buttons: [
      {
        label: '在 GitHub 上查看',
        to: 'https://github.com/u1805/mew',
        type: 'primary',
      },
    ],
  },
];
function FadeInSection({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const [isVisible, setVisible] = useState(false);
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (domRef.current) observer.unobserve(domRef.current);
        }
      });
    });

    const currentRef = domRef.current;
    if (currentRef) observer.observe(currentRef);

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, []);

  return (
    <div
      ref={domRef}
      className={clsx(styles.fadeInSection, isVisible && styles.isVisible)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function Feature({ title, image, description, reverse, tags, buttons }: FeatureItem) {
  return (
    <FadeInSection>
      <div className={clsx(styles.featureRow, reverse && styles.featureRowReverse)}>
        <div className={clsx(styles.featureContent)}>
          {tags && tags.length > 0 && (
            <div className={styles.tagList}>
              {tags.map((tag) => (
                <span key={tag} className={clsx(styles.tag, tag === title && styles.tagActive)}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          <Heading as="h3" className={styles.featureTitle}>{title}</Heading>
          <div className={styles.featureDescription}>{description}</div>

          {buttons && (
            <div className={styles.featureButtons}>
              {buttons.map((btn, idx) => (
                <Link
                  key={idx}
                  className={clsx(
                    'button',
                    btn.type === 'primary' ? 'button--primary' : 'button--secondary',
                    styles.featureBtn
                  )}
                  to={btn.to}>
                  {btn.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className={clsx(styles.featureImageWrapper)}>
          <img src={image} alt={title} className={styles.featureImage} />
        </div>
      </div>
    </FadeInSection>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className={styles.featuresHeader}>
          <FadeInSection>
             <Heading as="h2" style={{ textAlign: 'center' }}>功能总览</Heading>
          </FadeInSection>
        </div>
        <div className={styles.featureList}>
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
