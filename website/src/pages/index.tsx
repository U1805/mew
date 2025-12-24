import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const heroImage = 'https://placehold.co/600x400/5865F2/white?text=Mew';

  return (
    <header className={styles.heroBanner}>
      <div className="container">
        <div className={styles.heroImageWrapper}>
          <img src={heroImage} alt="Mew 预览" className={styles.heroImage} />
        </div>

        <Heading as="h1" className={styles.heroTitle}>
          高扩展性的个人数字中心。
        </Heading>

        <div className={styles.heroSubtitle}>
          另一个开源自托管的 <span className={styles.highlightWord}>Discord</span>, 但不只是 IM
        </div>

        <p className={styles.heroDescription}>
          Silence the web, hear the Mew.
          <br />
          A whisper in the digital noise.
        </p>

        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/guide/getting-started">
            快速开始
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="/docs/core-api">
            核心 API
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="https://github.com/u1805/mew">
            GitHub
          </Link>
        </div>

        <Link to="#" className={styles.secondaryLink}>
          Or direct visit Mew nightly version
        </Link>

        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#999' }}>
          Current version: v1.11.7, release note
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - A whisper in the digital noise`}
      description="Description will go into a meta tag in <head />">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
