import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  VPPortfolio,
  VPCustomCategory,
  VPPortfolioItem,
} from "../../../types/verification";
import { supabase } from "../../../lib/supabase";
import { extractYoutubeId } from "../../../utils/verification";
import { compressAndUpload } from "../../../utils/uploadMedia";
import { showToast } from "../../Toast";
import {
  GripVertical,
  Edit2,
  Trash2,
  Plus,
  ArrowRight,
  Save,
  X,
  Video,
  Image,
  FileText,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { VideoUploader } from "../VideoUploader";
import { ScaleButton } from "../../PageTransition";
import { DynamicWorkForm } from "../DynamicWorkForm";
import { YoutubeThumbnail } from "../../portfolio/YoutubeThumbnail";
import { getCategoryConfig } from "../../../utils/categoryConfig";

const LimitReachedBanner = ({ 
  type, 
  count, 
  max 
}: { 
  type: string
  count: number
  max: number 
}) => (
  <div style={{
    background: "rgba(239,68,68,0.06)",
    border: "0.5px solid rgba(239,68,68,0.2)",
    borderRadius: "12px",
    padding: "14px 16px",
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "12px"
  }}>
    <span style={{ fontSize: "18px", flexShrink: 0 }}>🎯</span>
    <div>
      <p style={{
        color: "var(--brand-text)",
        fontSize: "13px",
        fontWeight: 600,
        margin: "0 0 4px"
      }}>
        You've maxed out your {type} uploads!
      </p>
      <p style={{
        color: "var(--brand-text-secondary)",
        fontSize: "12px",
        margin: 0,
        lineHeight: 1.5
      }}>
        {count}/{max} {type}s used. 
        To add new work, delete an existing item first.
        Only your best work should make the cut anyway! 💪
      </p>
    </div>
  </div>
);

const WorkCounter = ({ 
  count, 
  max, 
  label 
}: { 
  count: number
  max: number
  label: string 
}) => {
  const pct = (count / max) * 100;
  const isFull = count >= max;
  const isNear = count >= max * 0.8;

  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: "4px"
      }}>
        <span style={{
          color: "var(--brand-text-secondary)",
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase"
        }}>
          {label}
        </span>
        <span style={{
          color: isFull ? "#ef4444" : 
                 isNear ? "#f97316" : 
                 "var(--brand-text-secondary)",
          fontSize: "10px",
          fontWeight: 700
        }}>
          {count} / {max}
        </span>
      </div>
      <div style={{
        height: "3px",
        background: "rgba(255,255,255,0.06)",
        borderRadius: "2px",
        overflow: "hidden"
      }}>
        <div style={{
          height: "100%",
          width: pct + "%",
          background: isFull ? "#ef4444" : 
                      isNear ? "#f97316" : 
                      "#2563eb",
          borderRadius: "2px",
          transition: "width 0.3s ease"
        }} />
      </div>
    </div>
  );
};

function SortableCategory({
  category,
  editingId,
  editName,
  setEditName,
  editDescription,
  setEditDescription,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  deletingId,
}: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
  };

  if (editingId === category.id) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`bg-[#1a1a1a] border border-[#2563eb] rounded-lg p-3 mb-2 ${isDragging ? "shadow-2xl shadow-black relative z-50" : ""}`}
      >
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full bg-[#0f0f0f] border border-[#333] text-white rounded p-2 text-sm font-bold mb-2 outline-none"
        />
        <input
          type="text"
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          className="w-full bg-[#0f0f0f] border border-[#333] text-white rounded p-2 text-xs mb-3 outline-none"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSaveEdit(category.id)}
            className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-1.5 rounded text-xs font-bold transition"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-[#888] hover:text-white px-2 py-1 text-xs font-bold transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-[#111] border border-[#222] rounded-lg p-3 mb-2 flex items-center ${isDragging ? "shadow-2xl shadow-black border-[#444] relative z-50" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="text-[#555] cursor-grab mr-3 hover:text-white transition p-1"
      >
        <GripVertical size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-bold text-sm truncate">
          {category.name}
        </div>
        {category.description && (
          <div className="text-[#888] text-[13px] truncate mt-0.5">
            {category.description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 ml-3">
        <button
          onClick={() => onStartEdit(category)}
          className="text-[#888] hover:text-white transition p-1"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => onDelete(category.id)}
          disabled={deletingId === category.id}
          className="text-[#dc2626] hover:text-[#ef4444] transition p-1 disabled:opacity-50 flex items-center justify-center"
        >
          {deletingId === category.id ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
        </button>
      </div>
    </div>
  );
}

const WorkLayoutToggle = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: "grid" | "horizontal") => void;
}) => (
  <div style={{ marginBottom: "24px" }}>
    <label
      style={{
        color: "#555",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        display: "block",
        marginBottom: "8px",
      }}
    >
      WORK LAYOUT
    </label>
    <div style={{ display: "flex", gap: "8px" }}>
      {[
        {
          value: "grid",
          label: "Grid",
          desc: "Vertical scroll",
          icon: (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "2px",
                width: "20px",
                height: "20px",
              }}
            >
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    background: "currentColor",
                    borderRadius: "1px",
                    opacity: 0.7,
                  }}
                />
              ))}
            </div>
          ),
        },
        {
          value: "horizontal",
          label: "Horizontal",
          desc: "Swipe through",
          icon: (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "3px",
                width: "20px",
              }}
            >
              {[1, 0.7, 0.85].map((o, i) => (
                <div
                  key={i}
                  style={{
                    height: "3px",
                    width: "100%",
                    background: "currentColor",
                    borderRadius: "1px",
                    opacity: o,
                  }}
                />
              ))}
            </div>
          ),
        },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value as "grid" | "horizontal")}
          style={{
            flex: 1,
            padding: "12px",
            background:
              value === option.value ? "rgba(239, 68, 68, 0.08)" : "#111",
            border:
              value === option.value
                ? "0.5px solid #EF4444"
                : "0.5px solid rgba(255,255,255,0.08)",
            borderRadius: "10px",
            color: value === option.value ? "white" : "rgba(255,255,255,0.4)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s",
          }}
        >
          {option.icon}
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                marginBottom: "2px",
              }}
            >
              {option.label}
            </div>
            <div
              style={{
                fontSize: "10px",
                opacity: 0.5,
              }}
            >
              {option.desc}
            </div>
          </div>
        </button>
      ))}
    </div>
  </div>
);

export function TabWork({
  portfolio,
  categories,
  setCategories,
  updatePortfolio,
}: {
  portfolio: VPPortfolio;
  categories: VPCustomCategory[];
  setCategories: any;
  updatePortfolio: (u: any) => void;
}) {
  const [items, setItems] = useState<VPPortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [workLayout, setWorkLayout] = useState(portfolio.work_layout || "grid");

  useEffect(() => {
    if (portfolio.work_layout) {
      setWorkLayout(portfolio.work_layout);
    }
  }, [portfolio.work_layout]);

  const handleLayoutChange = async (newLayout: "grid" | "horizontal") => {
    setWorkLayout(newLayout);
    updatePortfolio({ work_layout: newLayout });
    try {
      const { error } = await supabase
        .from("vp_portfolios")
        .update({ work_layout: newLayout })
        .eq("id", portfolio.id);

      console.log("[editor] work_layout saved:", newLayout, error);

      if (error) {
        showToast("Failed to save layout: " + error.message, "error");
      } else {
        showToast("Layout saved", "success");
      }
    } catch (e: any) {
      console.error(e);
      showToast("Error saving layout: " + e.message, "error");
    }
  };

  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    console.log("[cats] portfolioId changed:", portfolio.id);
    if (portfolio.id) {
      fetchCategories();
    }

    supabase
      .from("vp_portfolio_items")
      .select("*")
      .eq("portfolio_id", portfolio.id)
      .order("order_index")
      .then(({ data }) => {
        if (data) setItems(data);
        setLoading(false);
      });
  }, [portfolio.id]);

  const fetchCategories = async () => {
    if (!portfolio.id) {
      console.log("[cats] no portfolioId, skipping fetch");
      return;
    }

    console.log("[cats] fetching for portfolio:", portfolio.id);

    const { data, error } = await supabase
      .from("vp_custom_categories")
      .select("*")
      .eq("portfolio_id", portfolio.id)
      .order("order_index", { ascending: true });

    console.log("[cats] fetched:", data?.length, "categories, error:", error);

    if (!error && data) {
      setCategories(data);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setCategories((cats: VPCustomCategory[]) => {
        const oldIndex = cats.findIndex((c) => c.id === active.id);
        const newIndex = cats.findIndex((c) => c.id === over.id);
        const newArray = arrayMove(cats, oldIndex, newIndex);

        const updates = newArray.map((c, i) => ({ id: c.id, order_index: i }));
        (async () => {
          try {
            const { error } = await supabase.rpc("vp_update_category_orders", { payload: updates });
            if (error) console.error("Error updating category orders:", error);
          } catch (e) {
            console.error("Exception updating category orders:", e);
          }
        })();

        return newArray;
      });
    }
  };

  const handleAddCategory = async () => {
    if (isSaving) {
      console.log("[cats] blocked: already saving");
      return;
    }
    if (!newCategoryName.trim()) {
      setCategoryError("Category name is required");
      return;
    }

    // Count unique names to prevent going over 6
    const uniqueCount = new Set(categories.map((c) => c.id)).size;
    if (uniqueCount >= 6) {
      setCategoryError("Maximum 6 categories allowed");
      return;
    }

    setIsSaving(true);
    setCategoryError(null);

    try {
      const { data, error } = await supabase
        .from("vp_custom_categories")
        .insert({
          portfolio_id: portfolio.id,
          name: newCategoryName.trim(),
          description: newCategoryDescription?.trim() || null,
          order_index: categories.length,
        })
        .select()
        .single();

      console.log("[cats] add result:", data, error);

      if (error) {
        setCategoryError("Failed: " + error.message);
        return;
      }

      await fetchCategories();
      setNewCategoryName("");
      setNewCategoryDescription("");
      setShowAddForm(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (category: VPCustomCategory) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditDescription(category.description || "");
    setCategoryError(null);
  };

  const handleSaveEdit = async (categoryId: string) => {
    if (!editName.trim()) {
      setCategoryError("Name cannot be empty");
      return;
    }

    console.log("[cats] editing:", categoryId, editName);

    try {
      const res = await fetch("/api/categories?action=update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: categoryId,
          name: editName.trim(),
          description: editDescription?.trim() || null,
        }),
      });

      const text = await res.text();
      console.log("[cats] edit response:", text);

      let result;
      try {
        result = JSON.parse(text);
      } catch {
        setCategoryError("Server error");
        return;
      }

      if (!result.success) {
        setCategoryError("Failed: " + result.error);
        return;
      }

      await fetchCategories();
      setEditingId(null);
      setEditName("");
      setEditDescription("");
      setCategoryError(null);
    } catch (e: any) {
      console.error("[cats] edit crash:", e.message);
      setCategoryError("Error: " + e.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
    setCategoryError(null);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const confirmed = window.confirm(
      "Delete this category? Work items will become uncategorized.",
    );
    if (!confirmed) return;

    console.log("[cats] deleting:", categoryId);
    setDeletingId(categoryId);

    try {
      const res = await fetch("/api/categories?action=delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: categoryId }),
      });

      const text = await res.text();
      console.log("[cats] delete response:", text);

      let result;
      try {
        result = JSON.parse(text);
      } catch {
        setCategoryError("Server error");
        setDeletingId(null);
        return;
      }

      if (!result.success) {
        setCategoryError("Failed: " + result.error);
        setDeletingId(null);
        return;
      }

      await fetchCategories();
      setCategoryError(null);
    } catch (e: any) {
      console.error("[cats] delete crash:", e.message);
      setCategoryError("Error: " + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const saveWorkItem = async (
    itemData: Partial<VPPortfolioItem>,
    isNew: boolean,
  ) => {
    if (!itemData.title) throw new Error("Title is required");
    if (
      itemData.item_type === "youtube" &&
      !itemData.youtube_url &&
      !itemData.youtube_embed_id
    )
      throw new Error("URL required");

    // Ensure both image_url and imageUrl are synced
    if (itemData.imageUrl) {
      itemData.image_url = itemData.imageUrl;
    } else if (itemData.image_url) {
      itemData.imageUrl = itemData.image_url;
    }

    // Ensure all target link variations are unified
    if (itemData.liveProjectUrl) {
      itemData.project_url = itemData.liveProjectUrl;
      itemData.external_link = itemData.liveProjectUrl;
    } else if (itemData.project_url) {
      itemData.liveProjectUrl = itemData.project_url;
      itemData.external_link = itemData.project_url;
    } else if (itemData.external_link) {
      itemData.liveProjectUrl = itemData.external_link;
      itemData.project_url = itemData.external_link;
    }

    const activePortfolioId = portfolio.id;
    const uploadedStorageUrl = itemData.imageUrl || itemData.image_url || "";
    const liveProjectUrl =
      itemData.liveProjectUrl ||
      itemData.project_url ||
      itemData.external_link ||
      "";

    const payload = {
      ...itemData,
      portfolio_id: activePortfolioId,
      image_url: uploadedStorageUrl,
      imageUrl: uploadedStorageUrl,
      liveProjectUrl: liveProjectUrl,
      project_url: liveProjectUrl,
      external_link: liveProjectUrl,
      custom_thumbnail_url: (itemData as any).customThumbnailUrl || itemData.custom_thumbnail_url || null,
      type: itemData.item_type || "image",
      item_type: itemData.item_type || "image",
    };

    const supabasePayload: any = { ...payload };
    delete supabasePayload.imageUrl;
    delete supabasePayload.liveProjectUrl;
    delete supabasePayload.type; // Not in schema, might error
    delete supabasePayload.pdfUrl;
    delete supabasePayload.projectUrl;
    delete supabasePayload.externalLink;
    delete supabasePayload.linkPlatform;
    delete supabasePayload.customThumbnailUrl;
    delete supabasePayload.coverImageUrl;
    delete supabasePayload.youtubeEmbedId;
    delete supabasePayload.youtubeUrl;
    delete supabasePayload.clientName;
    delete supabasePayload.projectYear;
    delete supabasePayload.orderIndex;
    delete supabasePayload.filterTags;
    delete supabasePayload.aspectRatio;
    delete supabasePayload.videoReady;
    delete supabasePayload.textContent;
    delete supabasePayload.portfolioId;
    delete supabasePayload.customCategoryId;

    if (isNew) {
      const { data, error } = await supabase
        .from("vp_portfolio_items")
        .insert({
          ...supabasePayload,
          order_index: items.length,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (data) setItems([...items, data]);
      setAddingToCategory(null);
      window.dispatchEvent(new CustomEvent("vp-portfolio-updated"));
    } else {
      const { error } = await supabase
        .from("vp_portfolio_items")
        .update(supabasePayload)
        .eq("id", itemData.id);
      if (error) throw new Error(error.message);
      setItems(
        items.map((i) => (i.id === itemData.id ? { ...i, ...payload } : i)),
      );
      setExpandedItemId(null);
      window.dispatchEvent(new CustomEvent("vp-portfolio-updated"));
    }
  };

  const deleteWorkItem = async (id: string) => {
    if (!window.confirm("Delete this work item?")) return;
    try {
      const res = await fetch("/api/portfolio?action=delete-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete item");
      }
      setItems(items.filter((i) => i.id !== id));
    } catch (e: any) {
      console.error("Failed to delete work item:", e);
      showToast("Could not delete item: " + e.message, "error");
    }
  };

  const getThumbnailImage = (item: VPPortfolioItem) => {
    const ytId = item.youtube_embed_id || extractYoutubeId(item.youtube_url || item.external_link || "");
    const targetYtId = ytId === "mock_video_id" ? null : ytId;

    return item.cover_image_url || 
           (item as any).customThumbnailUrl || 
           item.custom_thumbnail_url || 
           (item as any).imageUrl || 
           item.image_url || 
           (targetYtId ? `https://img.youtube.com/vi/${targetYtId}/maxresdefault.jpg` : null);
  };

  const getYoutubeId = (item: VPPortfolioItem) => {
    return (
      item.youtube_embed_id ||
      extractYoutubeId(item.youtube_url || item.external_link || "")
    );
  };

  const config = getCategoryConfig(portfolio.category);

  const imageCount = items.filter(
    (i) => i.item_type === "image" || i.image_url
  ).length;

  const videoCount = items.filter(
    (i) => i.item_type === "youtube" || i.youtube_embed_id || i.external_link
  ).length;

  const pdfCount = items.filter((i) => i.pdf_url).length;

  const imageLimit = config?.maxImages || 20;
  const videoLimit = config?.maxVideos || 20;
  const pdfLimit = config?.maxPDFs || 5;

  const imagesFull = imageCount >= imageLimit;
  const videosFull = videoCount >= videoLimit;
  const pdfsFull = pdfCount >= pdfLimit;

  // Let them add if they haven't maxed out at least one of their allowed media types
  const canAddMedia = [] as boolean[];
  if (config?.imageEnabled) canAddMedia.push(!imagesFull);
  if (config?.videoEmbedEnabled) canAddMedia.push(!videosFull);
  if (config?.pdfEnabled) canAddMedia.push(!pdfsFull);
  
  const canAddMore = canAddMedia.length > 0 ? canAddMedia.some(v => v) : items.length < 20;

  const renderGroup = (catId: string | null, title: string) => {
    const groupItems = items.filter((i) =>
      catId === null ? !i.custom_category_id : i.custom_category_id === catId,
    );

    const catIdKey = catId || "uncategorized";

    return (
      <div key={catIdKey} className="mb-10 last:mb-0">
        <h4 className="text-brand-text font-bold text-sm mb-4 border-l-[3px] border-[#EF4444] pl-3 py-0.5">
          {title}
        </h4>

        <div className="space-y-3">
          {groupItems.map((item) => (
            <div key={item.id}>
              {expandedItemId === item.id ? (
                <WorkItemEditor
                  portfolioCategory={portfolio.category}
                  itemsCount={items.length}
                  pdfCount={
                    items.filter((i) => i.pdf_url || i.item_type === "pdf")
                      .length
                  }
                  videoCount={
                    items.filter(
                      (i) =>
                        i.item_type === "youtube" ||
                        i.link_platform === "youtube" ||
                        i.youtube_url ||
                        i.youtube_embed_id,
                    ).length
                  }
                  imageCount={
                    items.filter(
                      (i) =>
                        i.item_type === "image" && i.image_url && !i.pdf_url,
                    ).length
                  }
                  linkCount={
                    items.filter(
                      (i) =>
                        i.item_type === "link" ||
                        (!i.image_url &&
                          !i.pdf_url &&
                          !i.youtube_embed_id &&
                          (i.project_url ||
                            i.liveProjectUrl ||
                            i.external_link)),
                    ).length
                  }
                  initialData={item}
                  onSave={saveWorkItem}
                  onCancel={() => setExpandedItemId(null)}
                  categories={categories}
                />
              ) : (
                <div
                  onClick={() => setExpandedItemId(item.id)}
                  className="bg-gray-50 dark:bg-[#111] hover:bg-brand-surface border border-brand-border hover:border-brand-border rounded-lg p-3 flex items-center gap-4 cursor-pointer transition"
                >
                  <div className="w-[60px] h-[60px] rounded shrink-0 bg-brand-surface border border-brand-border overflow-hidden flex items-center justify-center relative">
                    {getThumbnailImage(item) ? (
                      <img
                        src={getThumbnailImage(item)!}
                        className="w-full h-full object-cover"
                      />
                    ) : (item.item_type === "youtube" ||
                        item.link_platform === "youtube") &&
                      getYoutubeId(item) ? (
                      <YoutubeThumbnail videoId={getYoutubeId(item)!} />
                    ) : (
                      <FileText
                        size={20}
                        className="text-gray-400 dark:text-[#555]"
                      />
                    )}
                    <div className="absolute bottom-0 right-0 bg-black/80 px-1 py-0.5 rounded-tl text-[8px] font-bold uppercase text-brand-text shadow">
                      {item.link_platform || item.item_type || "item"}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-brand-text font-bold text-sm truncate">
                      {item.title || "Untitled Project"}
                    </div>
                    <div className="text-gray-400 dark:text-[#555] text-xs font-medium uppercase tracking-wider mt-1 flex gap-2 items-center">
                      <span>
                        {item.client_name || "CONFIDENTIAL"} •{" "}
                        {item.project_year || new Date().getFullYear()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 items-center shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedItemId(item.id);
                      }}
                      type="button"
                      className="text-brand-text-secondary hover:text-[#2563eb] p-2 transition"
                      title="Edit Item"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteWorkItem(item.id);
                      }}
                      type="button"
                      className="text-brand-text-secondary hover:text-[#EF4444] p-2 transition"
                      title="Delete Item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {addingToCategory === catIdKey ? (
            <WorkItemEditor
              itemsCount={items.length}
              pdfCount={
                items.filter((i) => i.pdf_url || i.item_type === "pdf").length
              }
              videoCount={
                items.filter(
                  (i) =>
                    i.item_type === "youtube" ||
                    i.link_platform === "youtube" ||
                    i.youtube_url ||
                    i.youtube_embed_id,
                ).length
              }
              imageCount={
                items.filter(
                  (i) => i.item_type === "image" && i.image_url && !i.pdf_url,
                ).length
              }
              linkCount={
                items.filter(
                  (i) =>
                    i.item_type === "link" ||
                    (!i.image_url &&
                      !i.pdf_url &&
                      !i.youtube_embed_id &&
                      (i.project_url || i.liveProjectUrl || i.external_link)),
                ).length
              }
              portfolioCategory={portfolio.category}
              defaultCatId={catId}
              onSave={saveWorkItem}
              onCancel={() => setAddingToCategory(null)}
              categories={categories}
            />
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setAddingToCategory(catIdKey)}
                disabled={!canAddMore}
                style={{
                  opacity: canAddMore ? 1 : 0.4,
                  cursor: canAddMore ? "pointer" : "not-allowed",
                }}
                className="flex-1 py-4 border-2 border-dashed border-brand-border hover:border-gray-400 dark:border-[#444] dark:hover:border-[#666] rounded-lg text-brand-text-secondary hover:text-brand-text text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Plus size={16} /> Add Work
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-12 fade-in pb-24">
      {/* WORK LAYOUT SETTING */}
      <WorkLayoutToggle value={workLayout} onChange={handleLayoutChange} />

      {/* CUSTOM CATEGORIES */}
      <div>
        <div className="flex items-end justify-between border-b border-brand-border pb-2 mb-4">
          <div>
            <h3 className="text-brand-text text-sm font-semibold">
              YOUR PROOF OF SKILL
            </h3>
            <p className="text-gray-400 dark:text-[#555] text-[10px] uppercase font-bold tracking-widest mt-1">
              Add your best work. Clients react to it.
            </p>
          </div>
          <div className="bg-brand-surface border border-brand-border text-brand-text-secondary px-2 py-1 rounded text-[10px] font-bold tracking-widest">
            {categories.length} / 6 CATEGORIES
          </div>
        </div>

        <div className="mb-8">
          {imagesFull && config?.imageEnabled && (
            <LimitReachedBanner type="image" count={imageCount} max={imageLimit} />
          )}
          {videosFull && config?.videoEmbedEnabled && (
            <LimitReachedBanner type="video" count={videoCount} max={videoLimit} />
          )}
          {pdfsFull && config?.pdfEnabled && (
            <LimitReachedBanner type="PDF" count={pdfCount} max={pdfLimit} />
          )}

          {config?.imageEnabled && (
            <WorkCounter count={imageCount} max={imageLimit} label="Images" />
          )}
          {config?.videoEmbedEnabled && (
            <WorkCounter count={videoCount} max={videoLimit} label="Videos" />
          )}
          {config?.pdfEnabled && (
            <WorkCounter count={pdfCount} max={pdfLimit} label="PDFs" />
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={categories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {categories.map((c) => (
              <SortableCategory
                key={c.id}
                category={c}
                editingId={editingId}
                editName={editName}
                setEditName={setEditName}
                editDescription={editDescription}
                setEditDescription={setEditDescription}
                onStartEdit={handleStartEdit}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
                onDelete={handleDeleteCategory}
                deletingId={deletingId}
              />
            ))}
          </SortableContext>
        </DndContext>

        {showAddForm ? (
          <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-3 mt-2">
            <input
              type="text"
              placeholder="Category Name (e.g. Testimonials)"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-[#333] text-white rounded p-2 text-sm font-bold mb-2 outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCategory();
                }
              }}
            />
            <input
              type="text"
              placeholder="Description (Optional)"
              value={newCategoryDescription}
              onChange={(e) => setNewCategoryDescription(e.target.value)}
              className="w-full bg-[#0f0f0f] border border-[#333] text-white rounded p-2 text-xs mb-3 outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCategory();
                }
              }}
            />
            {categoryError && (
              <div className="text-[#dc2626] text-[13px] mb-2">
                {categoryError}
              </div>
            )}
            <div className="flex items-center gap-2">
              <ScaleButton
                onClick={handleAddCategory}
                disabled={savingCategory}
                className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-1.5 rounded text-xs font-bold transition disabled:opacity-50"
              >
                {savingCategory ? "Saving..." : "Save Category"}
              </ScaleButton>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setCategoryError(null);
                  setNewCategoryName("");
                  setNewCategoryDescription("");
                }}
                className="text-[#888] hover:text-white px-2 py-1 text-xs font-bold transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNewCategoryName("");
              setNewCategoryDescription("");
              setShowAddForm(true);
              setCategoryError(null);
            }}
            disabled={categories.length >= 6}
            className={`w-full mt-2 py-3 border border-[#333] rounded-lg text-[#888] hover:text-white text-xs font-bold uppercase tracking-wider transition bg-transparent disabled:opacity-50 disabled:cursor-not-allowed ${categories.length >= 6 ? "hidden" : ""}`}
          >
            + Add Category
          </button>
        )}
      </div>

      {/* WORK ITEMS */}
      <div>
        {categories.map((c) => renderGroup(c.id, c.name.toUpperCase()))}
        {renderGroup(null, "UNCATEGORIZED")}
      </div>

      {/* FIXED COUNTER FOOTER IN LEFT PANEL */}
      <div className="fixed bottom-0 w-full md:w-[420px] bg-brand-surface border-t border-brand-border p-4 shrink-0 left-0">
        <div className="flex justify-between text-[10px] font-bold text-brand-text-secondary uppercase tracking-widest mb-2">
          <span>{items.length} / 20 WORK ITEMS</span>
        </div>
        <div className="h-2 bg-brand-surface rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ 
              width: `${(items.length / 20) * 100}%`, 
              backgroundColor: items.length >= 20 ? "#ef4444" : items.length >= 15 ? "#f97316" : "#10B981" 
            }}
          ></div>
        </div>
      </div>
    </div>
  );
}

const AspectRatioSelector = ({
  value,
  onChange,
}: {
  value: "horizontal" | "vertical";
  onChange: (val: "horizontal" | "vertical") => void;
}) => (
  <div style={{ display: "flex", gap: "8px" }}>
    <button
      type="button"
      onClick={() => onChange("horizontal")}
      style={{
        flex: 1,
        padding: "12px",
        background: value === "horizontal" ? "#1a0a0a" : "#111",
        border:
          value === "horizontal" ? "2px solid #EF4444" : "1px solid #2a2a2a",
        borderRadius: "8px",
        cursor: "pointer",
        textAlign: "center",
        transition: "all 0.15s",
      }}
    >
      {/* 16:9 visual representation */}
      <div
        style={{
          width: "48px",
          height: "27px",
          background: value === "horizontal" ? "#EF4444" : "#333",
          borderRadius: "3px",
          margin: "0 auto 8px",
        }}
      />
      <div
        style={{
          color: value === "horizontal" ? "#EF4444" : "#888",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        Long-Form
      </div>
      <div
        style={{
          color: "#555",
          fontSize: "10px",
          marginTop: "2px",
        }}
      >
        16:9 · Cinematic
      </div>
    </button>

    <button
      type="button"
      onClick={() => onChange("vertical")}
      style={{
        flex: 1,
        padding: "12px",
        background: value === "vertical" ? "#1a0a0a" : "#111",
        border:
          value === "vertical" ? "2px solid #EF4444" : "1px solid #2a2a2a",
        borderRadius: "8px",
        cursor: "pointer",
        textAlign: "center",
        transition: "all 0.15s",
      }}
    >
      {/* 9:16 visual representation */}
      <div
        style={{
          width: "24px",
          height: "42px",
          background: value === "vertical" ? "#EF4444" : "#333",
          borderRadius: "3px",
          margin: "0 auto 8px",
        }}
      />
      <div
        style={{
          color: value === "vertical" ? "#EF4444" : "#888",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        Short-Form
      </div>
      <div
        style={{
          color: "#555",
          fontSize: "10px",
          marginTop: "2px",
        }}
      >
        9:16 · Reels · TikTok
      </div>
    </button>
  </div>
);

function WorkItemEditor({
  initialData,
  onSave,
  onCancel,
  defaultCatId,
  defaultItemType = "image",
  categories,
  portfolioCategory,
  itemsCount,
  pdfCount,
  imageCount,
  videoCount,
  linkCount,
}: any) {
  const isNew = !initialData;
  const [form, setForm] = useState<Partial<VPPortfolioItem>>(
    initialData || {
      item_type: defaultItemType,
      title: "",
      description: "",
      custom_category_id: defaultCatId,
      youtube_url: "",
      image_url: "",
      text_content: "",
      client_name: "",
      project_year: new Date().getFullYear(),
      filter_tags: [],
    },
  );

  const [videoId, setVideoId] = useState(initialData?.youtube_embed_id || "");
  const [savingWork, setSavingWork] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"horizontal" | "vertical">(
    initialData?.aspect_ratio || "horizontal",
  );

  useEffect(() => {
    if (initialData) {
      setAspectRatio(initialData.aspect_ratio || "horizontal");
    }
  }, [initialData]);

  const ytId =
    form.item_type === "youtube"
      ? extractYoutubeId(form.youtube_url || "")
      : null;

  const handleVideoUploaded = async (
    uploadedVideoId: string,
    embedUrl: string,
    isReady?: boolean,
    originalUrl?: string,
  ) => {
    console.log("[work] video uploaded callback:", uploadedVideoId);

    const urlToUse =
      originalUrl || "https://www.youtube.com/watch?v=" + uploadedVideoId;
    const isShorts = urlToUse.includes("/shorts/");

    // Update BOTH states so Save button can find the videoId
    setVideoId(uploadedVideoId);
    setForm((prev) => {
      const currentTags = prev.tags || [];
      const newTags = currentTags.filter(
        (t) => t !== "aspect:9:16" && t !== "aspect:16:9",
      );
      newTags.push(isShorts ? "aspect:9:16" : "aspect:16:9");

      return {
        ...prev,
        youtube_embed_id: uploadedVideoId,
        youtube_url: urlToUse,
        item_type: "youtube",
        tags: newTags,
      };
    });

    // Save to database immediately if it's already an existing record
    if (form.id) {
      const currentTags = form.tags || [];
      const newTags = currentTags.filter(
        (t) => t !== "aspect:9:16" && t !== "aspect:16:9",
      );
      newTags.push(isShorts ? "aspect:9:16" : "aspect:16:9");

      const { error } = await supabase
        .from("vp_portfolio_items")
        .update({
          youtube_embed_id: uploadedVideoId,
          youtube_url: urlToUse,
          item_type: "youtube",
          tags: newTags,
        })
        .eq("id", form.id);

      console.log("[work] saved videoId to db, error:", error);
    }
  };

  const handleSaveWorkItem = async () => {
    console.log("[save-work] saving work item...");
    console.log("[save-work] current videoId state:", videoId);
    console.log("[save-work] current item:", form);

    if (!form.title?.trim()) {
      setWorkError("Title is required");
      return;
    }

    setSavingWork(true);
    setWorkError(null);

    // Build the data object
    const workData: any = {
      ...form,
      title: form.title.trim(),
      description: form.description?.trim() || null,
      item_type: form.item_type || "youtube",
      client_name: form.client_name?.trim() || null,
      aspect_ratio: aspectRatio,
    };

    // Include video data if item_type is youtube
    if (form.item_type === "youtube" || !form.item_type) {
      const inputUrl = form.youtube_url || form.external_link || "";
      if (inputUrl) {
        const parsedId = extractYoutubeId(inputUrl);
        if (!parsedId) {
          showToast("Please enter a valid YouTube video link.", "error");
          setWorkError("Please enter a valid YouTube video link.");
          setSavingWork(false);
          return;
        }
      }

      // Get videoId from multiple possible sources
      const vid =
        form.youtube_embed_id ||
        videoId ||
        extractYoutubeId(form.youtube_url || "");

      console.log("[save-work] videoId resolved to:", vid);

      if (!vid) {
        showToast("Please enter a valid YouTube video link.", "error");
        setWorkError("Please enter a valid YouTube video link.");
        setSavingWork(false);
        return;
      }

      workData.youtube_embed_id = vid;
      workData.youtube_url =
        form.youtube_url || "https://www.youtube.com/watch?v=" + vid;
      workData.item_type = "youtube";
    }

    console.log("[save-work] saving to database via parent:", workData);

    try {
      await onSave(workData, isNew);
    } catch (e: any) {
      setWorkError(e.message);
    } finally {
      setSavingWork(false);
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-[#111] border border-brand-border rounded-lg p-5 mt-2 animate-in fade-in slide-in-from-top-2">
      <div className="mb-6 border-b border-brand-border border-dashed pb-6">
        <DynamicWorkForm
          category={portfolioCategory}
          currentItem={form}
          onChange={(updates) => setForm((f) => ({ ...f, ...updates }))}
          existingItemsCount={itemsCount}
          pdfCount={pdfCount}
          imageCount={imageCount}
          videoCount={videoCount}
          linkCount={linkCount}
        />
      </div>

      <div className="mb-6">
        <label className="block text-brand-text-secondary text-[10px] uppercase tracking-wider mb-1.5 font-bold">
          PORTFOLIO LAYOUT ORIENTATION
        </label>
        <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} />
      </div>

      <div className="mb-6">
        <label className="block text-brand-text-secondary text-[10px] uppercase tracking-wider mb-1.5 font-bold">
          CUSTOM OVERRIDE CATEGORY (OPTIONAL)
        </label>
        <select
          value={form.custom_category_id || ""}
          onChange={(e) =>
            setForm({ ...form, custom_category_id: e.target.value || null })
          }
          className="w-full bg-brand-surface border border-brand-border text-brand-text rounded-lg p-3 outline-none"
        >
          <option value="">Uncategorized Default</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {workError && (
        <div className="mb-4 text-red-500 bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-sm">
          {workError}
        </div>
      )}

      <div className="flex items-center gap-3 pt-4 border-t border-brand-border">
        <ScaleButton
          onClick={handleSaveWorkItem}
          disabled={savingWork}
          className="bg-[#2563eb] hover:bg-[#1d4ed8] text-brand-text px-5 py-2.5 rounded-lg font-bold text-sm transition shadow-lg disabled:opacity-50"
        >
          {savingWork ? "Saving..." : "Save Work Item"}
        </ScaleButton>
        <button
          onClick={onCancel}
          disabled={savingWork}
          className="text-brand-text-secondary hover:text-brand-text px-3 py-2 font-bold text-sm transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
