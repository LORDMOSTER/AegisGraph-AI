import { useEffect } from "react";

interface MetaOptions {
  title?: string;
  description?: string;
  keywords?: string;
}

const DEFAULT_TITLE = "AegisGraph AI — Industrial Safety Certification & GraphRAG Assessment Engine";
const DEFAULT_DESC =
  "AegisGraph AI is a mission-critical, offline-first GraphRAG assessment platform for industrial safety. Featuring DCWGT v2 knowledge graph traversal, dual-factor proctored exams, and tamper-proof verification.";

export function updateMetaTags({ title, description, keywords }: MetaOptions) {
  const fullTitle = title ? `${title} | AegisGraph AI` : DEFAULT_TITLE;
  document.title = fullTitle;

  // Update standard meta description
  let descTag = document.querySelector('meta[name="description"]');
  if (!descTag) {
    descTag = document.createElement("meta");
    descTag.setAttribute("name", "description");
    document.head.appendChild(descTag);
  }
  descTag.setAttribute("content", description || DEFAULT_DESC);

  // Update og:title
  let ogTitle = document.querySelector('meta[property="og:title"]');
  if (!ogTitle) {
    ogTitle = document.createElement("meta");
    ogTitle.setAttribute("property", "og:title");
    document.head.appendChild(ogTitle);
  }
  ogTitle.setAttribute("content", fullTitle);

  // Update og:description
  let ogDesc = document.querySelector('meta[property="og:description"]');
  if (!ogDesc) {
    ogDesc = document.createElement("meta");
    ogDesc.setAttribute("property", "og:description");
    document.head.appendChild(ogDesc);
  }
  ogDesc.setAttribute("content", description || DEFAULT_DESC);

  // Update twitter:title
  let twTitle = document.querySelector('meta[name="twitter:title"]');
  if (!twTitle) {
    twTitle = document.createElement("meta");
    twTitle.setAttribute("name", "twitter:title");
    document.head.appendChild(twTitle);
  }
  twTitle.setAttribute("content", fullTitle);

  // Update twitter:description
  let twDesc = document.querySelector('meta[name="twitter:description"]');
  if (!twDesc) {
    twDesc = document.createElement("meta");
    twDesc.setAttribute("name", "twitter:description");
    document.head.appendChild(twDesc);
  }
  twDesc.setAttribute("content", description || DEFAULT_DESC);

  // Optional keywords
  if (keywords) {
    let kwTag = document.querySelector('meta[name="keywords"]');
    if (!kwTag) {
      kwTag = document.createElement("meta");
      kwTag.setAttribute("name", "keywords");
      document.head.appendChild(kwTag);
    }
    kwTag.setAttribute("content", keywords);
  }
}

export function useMetaTags(options: MetaOptions) {
  useEffect(() => {
    updateMetaTags(options);
  }, [options.title, options.description, options.keywords]);
}
