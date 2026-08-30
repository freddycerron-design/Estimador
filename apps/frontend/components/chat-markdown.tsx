import type { ReactNode } from "react";
import type { Components } from "react-markdown";

/**
 * Render especial para las preguntas de aclaración del agente (spec pedido por usuario: "numera
 * las preguntas para que cuando respondan hagan referencia al número" + "cuando tengas posibles
 * respuestas incluye las opciones para que sean clickeables, máximo 5 donde la última sea
 * 'Otros'"). El system prompt (ver `agent/system-prompt.ts`, regla 9) le pide al agente que
 * formatee las preguntas como una lista markdown ORDENADA, y las opciones típicas (si las hay)
 * como una sub-lista de viñetas justo debajo de cada pregunta — acá interceptamos el render de
 * cualquier `<ol>` para detectar esa forma y convertir la sub-lista en botones clickeables, en vez
 * de depender de que react-markdown recorra el árbol por nosotros (así tenemos control total del
 * layout sin tener que encadenar contexto de React entre `ol`/`ul`/`li`).
 *
 * Cualquier `<ol>` sin sub-lista de opciones simplemente se ve como una lista numerada normal —
 * esto es intencional: no hace falta que el agente distinga "esto es una pregunta" de "esto es un
 * paso de una explicación", el único requisito es que las preguntas vayan numeradas.
 */

// Subconjunto mínimo del árbol hast que react-markdown nos pasa vía la prop `node` — no traemos
// el paquete `hast` como dependencia solo para tipar esto.
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function hastToPlainText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  if (!node.children) return "";
  return node.children.map(hastToPlainText).join("");
}

// Renderer inline mínimo para el texto de la pregunta en sí (puede traer **negritas**, etc.) —
// no reimplementamos markdown completo, solo lo típico en una pregunta corta.
function renderInline(node: HastNode, key: number): ReactNode {
  if (node.type === "text") return node.value;
  const kids = (node.children ?? []).map((c, i) => renderInline(c, i));
  switch (node.tagName) {
    case "strong":
      return <strong key={key}>{kids}</strong>;
    case "em":
      return <em key={key}>{kids}</em>;
    case "code":
      return (
        <code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-navy-800">
          {kids}
        </code>
      );
    case "a":
      return (
        <a key={key} href={typeof node.properties?.href === "string" ? node.properties.href : undefined} className="underline">
          {kids}
        </a>
      );
    case "br":
      return <br key={key} />;
    case "p":
    case "span":
    default:
      return <span key={key}>{kids}</span>;
  }
}

const MAX_OPTIONS = 5;
const OTHER_OPTION_PATTERN = /^otros?$/i;

export type OptionClickHandler = (questionNumber: number, optionText: string, isOther: boolean) => void;

function OrderedQuestionList({ node, onOptionClick }: { node: HastNode | undefined; onOptionClick: OptionClickHandler }) {
  const start = typeof node?.properties?.start === "number" ? (node.properties.start as number) : 1;
  const liNodes = (node?.children ?? []).filter((c) => c.type === "element" && c.tagName === "li");

  return (
    <ol className="ml-4 list-decimal space-y-3">
      {liNodes.map((li, i) => {
        const num = start + i;
        const children = li.children ?? [];
        const nestedListIdx = children.findIndex((c) => c.type === "element" && (c.tagName === "ul" || c.tagName === "ol"));
        const nestedList = nestedListIdx !== -1 ? children[nestedListIdx] : null;
        const contentNodes = nestedListIdx !== -1 ? children.filter((_, idx) => idx !== nestedListIdx) : children;
        const options = nestedList
          ? (nestedList.children ?? [])
              .filter((c) => c.type === "element" && c.tagName === "li")
              .map((optLi) => hastToPlainText(optLi).trim())
              .filter(Boolean)
              .slice(0, MAX_OPTIONS)
          : [];

        return (
          <li key={i} className="pl-1 marker:font-semibold marker:text-slate-400 dark:marker:text-slate-500">
            {contentNodes.map((c, ci) => renderInline(c, ci))}
            {options.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {options.map((opt, oi) => {
                  const isOther = oi === options.length - 1 && OTHER_OPTION_PATTERN.test(opt);
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => onOptionClick(num, opt, isOther)}
                      className={
                        isOther
                          ? "rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 dark:border-navy-600 dark:text-slate-400 dark:hover:bg-navy-700"
                          : "rounded-full border border-accent-200 bg-accent-50 px-3 py-1 text-xs font-medium text-accent-700 transition-colors hover:bg-accent-100 dark:border-azure-500/30 dark:bg-azure-500/10 dark:text-azure-300 dark:hover:bg-azure-500/20"
                      }
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function createChatMarkdownComponents(onOptionClick: OptionClickHandler): Components {
  return {
    ol: (props) => <OrderedQuestionList node={props.node as HastNode | undefined} onOptionClick={onOptionClick} />,
  };
}
