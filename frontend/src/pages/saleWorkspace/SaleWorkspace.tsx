import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { requestAdminApi } from "../../api/adminAuth";
import { Icon } from "../../components/ui/icon/Icon";
import "./SaleWorkspace.css";

type DiscountType = "sale_price" | "percentage" | "amount";
type TargetGroup = "all_users" | "new_users_only";
type SaleStatus = "active" | "scheduled" | "expired" | "disabled";

type Product = {
  id: string;
  name: string;
  price: number;
  unit: string;
  category?: string;
  imageUrl?: string;
  stockQuantity?: number | null;
  stockStatus?: string;
};

type Sale = {
  id: string;
  name: string;
  discountType: DiscountType;
  discountValue: number;
  targetUserGroup: TargetGroup;
  startsAt: string | null;
  endsAt: string | null;
  isEnabled: boolean;
  promoteOnHome: boolean;
  products: Array<{ id: string; name: string }>;
};

const peso = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(Math.max(0, value));

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-PH", {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "No limit";

const utcToLocalDateTime = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const localDateTimeToUtc = (value: string) =>
  value ? new Date(value).toISOString() : null;

const getSaleStatus = (sale: Sale, now = Date.now()): SaleStatus => {
  if (!sale.isEnabled) return "disabled";
  if (sale.endsAt && new Date(sale.endsAt).getTime() <= now) return "expired";
  if (sale.startsAt && new Date(sale.startsAt).getTime() > now) return "scheduled";
  return "active";
};

const timeRangesOverlap = (startsAt: string, endsAt: string, sale: Sale) => {
  const firstStart = startsAt ? new Date(startsAt).getTime() : -Infinity;
  const firstEnd = endsAt ? new Date(endsAt).getTime() : Infinity;
  const secondStart = sale.startsAt ? new Date(sale.startsAt).getTime() : -Infinity;
  const secondEnd = sale.endsAt ? new Date(sale.endsAt).getTime() : Infinity;
  return firstStart < secondEnd && secondStart < firstEnd;
};

const getSalePrice = (
  price: number,
  discountType: DiscountType,
  discountValue: number,
) => {
  if (!Number.isFinite(discountValue) || discountValue <= 0) return price;
  if (discountType === "sale_price") return discountValue;
  if (discountType === "percentage") return price * (1 - discountValue / 100);
  return price - discountValue;
};

const getDiscountLabel = (type: DiscountType, value: number) => {
  if (type === "percentage") return `${value}% OFF`;
  if (type === "amount") return `${peso(value)} OFF`;
  return `${peso(value)} SALE PRICE`;
};

const summarizeSaleProducts = (
  products: Sale["products"],
  visibleProductCount = 3,
) => {
  if (products.length === 0) return "No products";
  const visibleNames = products
    .slice(0, visibleProductCount)
    .map((product) => product.name)
    .join(", ");
  const remainingCount = products.length - visibleProductCount;
  return remainingCount > 0
    ? `${visibleNames} + ${remainingCount} more`
    : visibleNames;
};

const getStockTone = (product: Product) => {
  const status = product.stockStatus?.toLocaleLowerCase() ?? "";
  const quantity = product.stockQuantity;
  if (/out|sold|unavailable/.test(status) || quantity === 0) return "out";
  if (/low/.test(status) || (typeof quantity === "number" && quantity <= 5)) return "low";
  return "in";
};

const getStockLabel = (product: Product) => {
  const tone = getStockTone(product);
  if (tone === "out") return "Out of stock";
  if (tone === "low") {
    return typeof product.stockQuantity === "number"
      ? `Low stock · ${product.stockQuantity} left`
      : "Low stock";
  }
  return typeof product.stockQuantity === "number"
    ? `In stock · ${product.stockQuantity} available`
    : "In stock";
};

const statuses: Array<{ key: SaleStatus; label: string }> = [
  { key: "active", label: "Active" },
  { key: "scheduled", label: "Scheduled" },
  { key: "expired", label: "Expired" },
  { key: "disabled", label: "Disabled" },
];

const saleOverviewPageSize = 50;

export function SaleWorkspace({ onNotice }: { onNotice: (message: string) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const onNoticeRef = useRef(onNotice);
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [saleProductFilter, setSaleProductFilter] = useState("all");
  const [promotionFilter, setPromotionFilter] = useState<SaleStatus>("active");
  const [name, setName] = useState("");
  const [type, setType] = useState<DiscountType>("percentage");
  const [value, setValue] = useState("");
  const [target, setTarget] = useState<TargetGroup>("all_users");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [promoteOnHome, setPromoteOnHome] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busySaleId, setBusySaleId] = useState<string | null>(null);
  const [saleOverviewLimit, setSaleOverviewLimit] = useState(
    saleOverviewPageSize,
  );

  const resetForm = useCallback(() => {
    setName("");
    setType("percentage");
    setValue("");
    setTarget("all_users");
    setSelected([]);
    setStartsAt("");
    setEndsAt("");
    setPromoteOnHome(false);
    setEditingSaleId(null);
  }, []);

  const load = async () => {
    const data = (await requestAdminApi("/api/admin/sales")) as {
      sales: Sale[];
      products: Product[];
    };
    setSales(data.sales);
    setProducts(data.products);
  };

  useEffect(() => {
    onNoticeRef.current = onNotice;
  }, [onNotice]);

  useEffect(() => {
    void requestAdminApi("/api/admin/sales")
      .then((response) => {
        const data = response as { sales: Sale[]; products: Product[] };
        setSales(data.sales);
        setProducts(data.products);
      })
      .catch(() => onNoticeRef.current("Sales could not be loaded."));
  }, []);

  useEffect(() => {
    if (!isFormOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) {
        resetForm();
        setIsFormOpen(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFormOpen, isSaving, resetForm]);

  useEffect(() => {
    if (selected.length < 2 && promoteOnHome) setPromoteOnHome(false);
  }, [promoteOnHome, selected.length]);

  const saleStatusById = useMemo(
    () => new Map(sales.map((sale) => [sale.id, getSaleStatus(sale)])),
    [sales],
  );

  const enabledProductSales = useMemo(() => {
    const result = new Map<string, Sale[]>();
    sales.forEach((sale) => {
      const status = saleStatusById.get(sale.id);
      if (status !== "active" && status !== "scheduled") return;
      sale.products.forEach((product) => {
        result.set(product.id, [...(result.get(product.id) ?? []), sale]);
      });
    });
    return result;
  }, [saleStatusById, sales]);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter(Boolean))]
      .sort((a, b) => a!.localeCompare(b!)) as string[],
    [products],
  );

  const visibleProducts = useMemo(() => {
    const query = productQuery.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const matchesQuery = !query || `${product.name} ${product.unit} ${product.category ?? ""}`
        .toLocaleLowerCase().includes(query);
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      const stockTone = getStockTone(product);
      const matchesStock = stockFilter === "all" ||
        (stockFilter === "available" ? stockTone !== "out" : stockTone === stockFilter);
      const hasPromotion = (enabledProductSales.get(product.id) ?? [])
        .some((sale) => sale.id !== editingSaleId && timeRangesOverlap(startsAt, endsAt, sale));
      const matchesSale = saleProductFilter === "all" ||
        (saleProductFilter === "on_sale" ? hasPromotion : !hasPromotion);
      return matchesQuery && matchesCategory && matchesStock && matchesSale;
    });
  }, [categoryFilter, editingSaleId, enabledProductSales, endsAt, productQuery, products, saleProductFilter, startsAt, stockFilter]);

  const discountValue = Number(value);
  const selectedProducts = products.filter((product) => selected.includes(product.id));
  const invalidPreviewCount = selectedProducts.filter((product) => {
    const price = getSalePrice(product.price, type, discountValue);
    return price <= 0 || price >= product.price;
  }).length;
  const isDiscountValid = Number.isFinite(discountValue) && discountValue > 0 && invalidPreviewCount === 0;
  const isDateRangeValid = !startsAt || !endsAt || new Date(endsAt) > new Date(startsAt);

  const summary = useMemo(() => {
    const active = sales.filter((sale) => saleStatusById.get(sale.id) === "active");
    const scheduled = sales.filter((sale) => saleStatusById.get(sale.id) === "scheduled");
    const current = [...active, ...scheduled];
    return {
      active: active.length,
      newUser: current.filter((sale) => sale.targetUserGroup === "new_users_only").length,
      products: new Set(active.flatMap((sale) => sale.products.map((product) => product.id))).size,
      scheduled: scheduled.length,
    };
  }, [saleStatusById, sales]);

  const promotionCounts = useMemo(() => statuses.reduce<Record<SaleStatus, number>>(
    (counts, status) => {
      counts[status.key] = sales.filter((sale) => saleStatusById.get(sale.id) === status.key).length;
      return counts;
    },
    { active: 0, disabled: 0, expired: 0, scheduled: 0 },
  ), [saleStatusById, sales]);

  const filteredSales = sales.filter((sale) => saleStatusById.get(sale.id) === promotionFilter);

  const productsOnSale = useMemo(() => sales.flatMap((sale) => {
    const status = saleStatusById.get(sale.id);
    if (status !== "active" && status !== "scheduled") return [];
    return sale.products.flatMap((saleProduct) => {
      const product = products.find((item) => item.id === saleProduct.id);
      return product ? [{ product, sale, status }] : [];
    });
  }), [products, saleStatusById, sales]);

  const visibleProductsOnSale = productsOnSale.slice(0, saleOverviewLimit);

  const selectVisible = () => setSelected((items) => [
    ...new Set([
      ...items,
      ...visibleProducts.filter((product) =>
        getStockTone(product) !== "out" &&
        !(enabledProductSales.get(product.id) ?? []).some((sale) =>
          sale.id !== editingSaleId && timeRangesOverlap(startsAt, endsAt, sale)
        ),
      ).map((product) => product.id),
    ]),
  ]);

  const clearVisible = () => setSelected((items) =>
    items.filter((id) => !visibleProducts.some((product) => product.id === id)),
  );

  const closeForm = () => {
    if (isSaving) return;
    resetForm();
    setIsFormOpen(false);
  };

  const createOrUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!isDiscountValid) {
      onNotice("Enter a discount that lowers every selected product price.");
      return;
    }
    setIsSaving(true);
    try {
      await requestAdminApi(editingSaleId ? `/api/admin/sales/${editingSaleId}` : "/api/admin/sales", {
        method: editingSaleId ? "PATCH" : "POST",
        body: JSON.stringify({
          commodityIds: selected.map(Number), discountType: type, discountValue,
          endsAt: localDateTimeToUtc(endsAt), name, startsAt: localDateTimeToUtc(startsAt),
          promoteOnHome,
          targetUserGroup: target,
        }),
      });
      const wasEditing = Boolean(editingSaleId);
      resetForm();
      setIsFormOpen(false);
      await load();
      onNotice(wasEditing ? "Promotion updated." : "Promotion created.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "The promotion could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const edit = (sale: Sale) => {
    setEditingSaleId(sale.id);
    setName(sale.name);
    setType(sale.discountType);
    setValue(String(sale.discountValue));
    setTarget(sale.targetUserGroup);
    setSelected(sale.products.map((product) => product.id));
    setStartsAt(utcToLocalDateTime(sale.startsAt));
    setEndsAt(utcToLocalDateTime(sale.endsAt));
    setPromoteOnHome(sale.promoteOnHome);
    setIsFormOpen(true);
  };

  const toggle = async (sale: Sale) => {
    setBusySaleId(sale.id);
    try {
      await requestAdminApi(`/api/admin/sales/${sale.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: !sale.isEnabled }),
      });
      await load();
      onNotice(sale.isEnabled ? "Promotion disabled." : "Promotion enabled.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Promotion status could not be changed.");
    } finally {
      setBusySaleId(null);
    }
  };

  const remove = async (sale: Sale) => {
    if (!window.confirm(`Remove ${sale.name}? This cannot be undone.`)) return;
    setBusySaleId(sale.id);
    try {
      await requestAdminApi(`/api/admin/sales/${sale.id}`, { method: "DELETE" });
      if (editingSaleId === sale.id) resetForm();
      await load();
      onNotice("Promotion removed.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Promotion could not be removed.");
    } finally {
      setBusySaleId(null);
    }
  };

  return (
    <section className="user-workspace farmer-workspace sale-workspace" aria-labelledby="sales-discounts-title">
      <header className="sale-page-header">
        <div>
          <span className="sale-eyebrow">SALES MANAGEMENT</span>
          <h1 id="sales-discounts-title">Sales &amp; Discounts</h1>
          <p>Create targeted offers while every product keeps its original base price.</p>
        </div>
        <div className="sale-header-actions">
          <span className="sale-price-safety"><Icon name="lock" size={14} /> Base prices protected</span>
          <button
            className="sale-primary-button sale-header-button"
            type="button"
            onClick={() => {
              resetForm();
              setIsFormOpen(true);
            }}
          >
            <Icon name="plus" size={15} /> Create sale
          </button>
        </div>
      </header>

      <div className="sale-summary-grid" aria-label="Sales overview">
        <article className="sale-summary-card"><span className="sale-summary-icon"><Icon name="trend" size={17} /></span><div><span>Active sales</span><strong>{summary.active}</strong></div><small><i className="sale-live-dot" /> Running now</small></article>
        <article className="sale-summary-card"><span className="sale-summary-icon"><Icon name="basket" size={17} /></span><div><span>Products on sale</span><strong>{summary.products}</strong></div><small>Unique discounted products</small></article>
        <article className="sale-summary-card"><span className="sale-summary-icon"><Icon name="users" size={17} /></span><div><span>New-user offers</span><strong>{summary.newUser}</strong></div><small>Introductory promotions</small></article>
        <article className="sale-summary-card"><span className="sale-summary-icon"><Icon name="calendar" size={17} /></span><div><span>Scheduled sales</span><strong>{summary.scheduled}</strong></div><small>Upcoming promotions</small></article>
      </div>

      {isFormOpen && (
      <div className="sale-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
      <form className="sale-panel sale-form" id="sale-promotion-form" onSubmit={createOrUpdate} ref={formRef} role="dialog" aria-modal="true" aria-labelledby="sale-form-title">
        <div className="sale-panel-heading">
          <div><span className="sale-eyebrow">{editingSaleId ? "EDIT PROMOTION" : "CREATE PROMOTION"}</span><h2 id="sale-form-title">{editingSaleId ? "Update promotion" : "Set up a product sale"}</h2></div>
          <button className="sale-modal-close" type="button" onClick={closeForm} aria-label="Close promotion form"><Icon name="close" size={17} /></button>
        </div>

        <ol className="sale-steps" aria-label="Promotion setup steps">
          <li className={name && value ? "is-complete" : "is-current"}><span>1</span><div><strong>Sale details</strong><small>Name, discount &amp; dates</small></div></li>
          <li className={selected.length ? "is-complete" : ""}><span>2</span><div><strong>Select products</strong><small>{selected.length} selected</small></div></li>
          <li className={isDiscountValid && selected.length ? "is-complete" : ""}><span>3</span><div><strong>Review discount</strong><small>Check final prices</small></div></li>
          <li><span>4</span><div><strong>{editingSaleId ? "Save changes" : "Create sale"}</strong><small>Publish promotion</small></div></li>
        </ol>

        <section className="sale-form-section" aria-labelledby="sale-details-heading">
          <div className="sale-section-title"><span>1</span><div><h3 id="sale-details-heading">Sale details</h3><p>Define the offer and when it should run.</p></div></div>
          <div className="sale-detail-grid">
            <label className="sale-field sale-field-wide"><span>Sale name</span><input required placeholder="e.g. Weekend harvest sale" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="sale-field"><span>Discount type</span><select value={type} onChange={(event) => setType(event.target.value as DiscountType)}><option value="percentage">Percentage off</option><option value="amount">Peso amount off</option><option value="sale_price">Fixed sale price</option></select></label>
            <label className="sale-field"><span>Discount value</span><span className="sale-input-affix"><b>{type === "percentage" ? "%" : "₱"}</b><input required min="0.01" max={type === "percentage" ? "99.99" : undefined} step="0.01" type="number" placeholder={type === "percentage" ? "10" : "0.00"} value={value} onChange={(event) => setValue(event.target.value)} /></span></label>
            <label className="sale-field"><span>Starts</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
            <label className="sale-field"><span>Ends</span><input type="datetime-local" min={startsAt || undefined} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
          </div>
          <fieldset className="sale-audience-fieldset">
            <legend>Target users</legend>
            <label className={target === "all_users" ? "is-selected" : ""}><input type="radio" name="target-users" value="all_users" checked={target === "all_users"} onChange={() => setTarget("all_users")} /><span className="sale-radio-mark" /><span><strong>All users</strong><small>Available to eligible existing and new buyers.</small></span></label>
            <label className={target === "new_users_only" ? "is-selected" : ""}><input type="radio" name="target-users" value="new_users_only" checked={target === "new_users_only"} onChange={() => setTarget("new_users_only")} /><span className="sale-radio-mark" /><span><strong>New users only</strong><small>Only eligible first-time and new buyers.</small></span></label>
          </fieldset>
        </section>

        <section className="sale-form-section" aria-labelledby="sale-products-heading">
          <div className="sale-section-title"><span>2</span><div><h3 id="sale-products-heading">Select products</h3><p>Products in another live or scheduled sale are protected from conflicts.</p></div><strong className="sale-selection-count">{selected.length} selected</strong></div>
          <div className="sale-product-toolbar">
            <label className="sale-search"><Icon name="search" size={16} /><input aria-label="Search products" placeholder="Search products" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} /></label>
            <select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
            <select aria-label="Filter by stock" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}><option value="all">All stock</option><option value="available">Available</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
            <select aria-label="Filter by promotion" value={saleProductFilter} onChange={(event) => setSaleProductFilter(event.target.value)}><option value="all">All sale states</option><option value="available">Not on sale</option><option value="on_sale">Already on sale</option></select>
          </div>
          <div className="sale-product-actions"><span>{visibleProducts.length} products shown</span><button type="button" onClick={selectVisible}>Select visible</button><button type="button" onClick={clearVisible}>Clear visible</button></div>
          <div className="sale-product-list">
            {visibleProducts.map((product) => {
              const conflictingSale = (enabledProductSales.get(product.id) ?? []).find((sale) =>
                sale.id !== editingSaleId && timeRangesOverlap(startsAt, endsAt, sale)
              );
              const isUnavailable = Boolean(conflictingSale) || getStockTone(product) === "out";
              const checked = selected.includes(product.id);
              const price = getSalePrice(product.price, type, discountValue);
              const showPreview = value !== "" && price > 0 && price < product.price;
              return (
                <label className={`sale-product ${checked ? "is-selected" : ""} ${isUnavailable ? "is-unavailable" : ""}`} key={product.id}>
                  <input type="checkbox" checked={checked} disabled={isUnavailable} onChange={() => setSelected((items) => items.includes(product.id) ? items.filter((id) => id !== product.id) : [...items, product.id])} />
                  <span className="sale-checkmark" aria-hidden="true" />
                  <span className="sale-product-image"><Icon name="leaf" size={20} />{product.imageUrl && <img src={product.imageUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
                  <span className="sale-product-info"><strong>{product.name}</strong><small>{product.category ?? "Fresh produce"} · {getStockLabel(product)}</small>{conflictingSale && <em>Included in “{conflictingSale.name}”</em>}</span>
                  <span className="sale-product-price">{showPreview ? <><s>{peso(product.price)}/{product.unit}</s><strong>{peso(price)}/{product.unit}</strong></> : <strong>{peso(product.price)}/{product.unit}</strong>}<small>{showPreview ? getDiscountLabel(type, discountValue) : "Enter a discount"}</small></span>
                </label>
              );
            })}
            {visibleProducts.length === 0 && <div className="sale-empty"><Icon name="search" size={22} /><strong>No products found</strong><span>Try clearing one of the filters.</span></div>}
          </div>
        </section>

        <section className="sale-review" aria-labelledby="sale-review-heading">
          <div className="sale-section-title"><span>3</span><div><h3 id="sale-review-heading">Review discount</h3><p>Base prices remain unchanged after this promotion ends.</p></div></div>
          <div className="sale-review-grid"><div><small>Promotion</small><strong>{name || "Untitled sale"}</strong></div><div><small>Audience</small><strong>{target === "new_users_only" ? "New users only" : "All users"}</strong></div><div><small>Discount</small><strong>{value && discountValue > 0 ? getDiscountLabel(type, discountValue) : "Not set"}</strong></div><div><small>Products</small><strong>{selected.length} selected</strong></div></div>
          <label className={`sale-home-toggle ${promoteOnHome ? "is-selected" : ""} ${selected.length < 2 ? "is-disabled" : ""}`}>
            <input type="checkbox" checked={promoteOnHome} disabled={selected.length < 2} onChange={(event) => setPromoteOnHome(event.target.checked)} />
            <span className="sale-home-toggle-icon"><Icon name="trend" size={17} /></span>
            <span><strong>Promote on Home</strong><small>{selected.length < 2 ? "Select at least two products to create one campaign banner." : "Creates one clickable campaign banner for all selected products."}</small></span>
            <span className="sale-home-toggle-control" aria-hidden="true" />
          </label>
          <p className="sale-home-rule"><Icon name="lock" size={14} /> Individual product discounts change the price only and never create a banner automatically.</p>
          {invalidPreviewCount > 0 && <p className="sale-validation-message">The discount must create a price above ₱0 and below the base price for every selected product.</p>}
          {!isDateRangeValid && <p className="sale-validation-message">The end date must be after the start date.</p>}
          <div className="sale-submit-row"><span><Icon name="lock" size={15} /> Discounts never overwrite the original product price.</span><button className="sale-primary-button" disabled={!name.trim() || selected.length === 0 || !isDiscountValid || !isDateRangeValid || isSaving} type="submit">{isSaving ? "Saving…" : editingSaleId ? "Save promotion" : "Create sale"}{!isSaving && <Icon name="arrow" size={15} />}</button></div>
        </section>
      </form>
      </div>
      )}

      <section className="sale-panel sale-management" aria-labelledby="promotion-management-heading">
        <div className="sale-panel-heading"><div><span className="sale-eyebrow">PROMOTION MANAGEMENT</span><h2 id="promotion-management-heading">Your promotions</h2></div><span className="sale-panel-total">{sales.length} total</span></div>
        <div className="sale-tabs" role="tablist" aria-label="Promotion status">
          {statuses.map((status) => <button aria-selected={promotionFilter === status.key} className={promotionFilter === status.key ? "is-active" : ""} key={status.key} onClick={() => setPromotionFilter(status.key)} role="tab" type="button">{status.label}<span>{promotionCounts[status.key]}</span></button>)}
        </div>
        <div className="sale-promotion-list">
          {filteredSales.map((sale) => {
            const status = saleStatusById.get(sale.id) ?? "disabled";
            return (
              <article className="sale-promotion" key={sale.id}>
                <div className="sale-promotion-main"><span className="sale-promotion-icon"><Icon name="leaf" size={18} /></span><div><div className="sale-promotion-title"><strong>{sale.name}</strong><span className={`sale-status sale-status-${status}`}>{status}</span>{sale.promoteOnHome && <span className="sale-home-badge">Home banner</span>}</div><p>{sale.targetUserGroup === "new_users_only" ? "New users only" : "All users"} <i /> {getDiscountLabel(sale.discountType, sale.discountValue)} <i /> {sale.products.length} {sale.products.length === 1 ? "product" : "products"}</p><small>{formatDate(sale.startsAt)} <span>→</span> {formatDate(sale.endsAt)}</small></div></div>
                <div className="sale-promotion-products" aria-label={`${sale.products.length} products in this promotion`}><small>PRODUCTS</small><span>{summarizeSaleProducts(sale.products)}</span></div>
                <div className="sale-promotion-actions"><button className="icon-action-button" type="button" onClick={() => edit(sale)} aria-label={`Edit ${sale.name}`} title="Edit"><Icon name="edit" size={16} /></button><button className="icon-action-button" disabled={busySaleId === sale.id} type="button" onClick={() => void toggle(sale)} aria-label={`${sale.isEnabled ? "Disable" : "Enable"} ${sale.name}`} title={sale.isEnabled ? "Disable" : "Enable"}><Icon name="power" size={16} /></button><button className="icon-action-button icon-action-button--danger" disabled={busySaleId === sale.id} type="button" onClick={() => void remove(sale)} aria-label={`Remove ${sale.name}`} title="Remove"><Icon name="trash" size={16} /></button></div>
              </article>
            );
          })}
          {filteredSales.length === 0 && <div className="sale-empty"><Icon name="calendar" size={22} /><strong>No {promotionFilter} promotions</strong><span>Promotions will appear here when their status changes.</span></div>}
        </div>
      </section>

      <section className="sale-panel sale-overview" aria-labelledby="products-on-sale-heading">
        <div className="sale-panel-heading"><div><span className="sale-eyebrow">PRODUCT-LEVEL OVERVIEW</span><h2 id="products-on-sale-heading">Products on sale</h2></div><p>See every active and upcoming price at a glance.</p></div>
        <div className="sale-table-wrap">
          <table><thead><tr><th>Product</th><th>Original</th><th>Sale price</th><th>Discount</th><th>Promotion</th><th>Status</th></tr></thead><tbody>
            {visibleProductsOnSale.map(({ product, sale, status }) => <tr key={`${sale.id}-${product.id}`}>
              <td data-label="Product"><span className="sale-table-product"><span className="sale-product-image"><Icon name="leaf" size={17} />{product.imageUrl && <img src={product.imageUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}</span><span><strong>{product.name}</strong><small>{product.category ?? "Fresh produce"}</small></span></span></td>
              <td data-label="Original"><s>{peso(product.price)}/{product.unit}</s></td><td data-label="Sale price"><strong className="sale-table-price">{peso(getSalePrice(product.price, sale.discountType, sale.discountValue))}/{product.unit}</strong></td><td data-label="Discount"><span className="sale-discount-chip">{getDiscountLabel(sale.discountType, sale.discountValue)}</span></td><td data-label="Promotion">{sale.name}</td><td data-label="Status"><span className={`sale-status sale-status-${status}`}>{status}</span></td>
            </tr>)}
          </tbody></table>
          {productsOnSale.length > visibleProductsOnSale.length && (
            <div className="sale-overview-more">
              <span>
                Showing {visibleProductsOnSale.length} of {productsOnSale.length} products
              </span>
              <button
                type="button"
                onClick={() => setSaleOverviewLimit((limit) => limit + saleOverviewPageSize)}
              >
                Show 50 more
              </button>
            </div>
          )}
          {productsOnSale.length === 0 && <div className="sale-empty"><Icon name="basket" size={22} /><strong>No products on sale</strong><span>Create or schedule a promotion to see discounted products here.</span></div>}
        </div>
      </section>
    </section>
  );
}
