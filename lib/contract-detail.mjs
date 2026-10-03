import '../public/quote-math.js';
  export function quotePayloadFromData(data) {
    const source = structuredClone(data), rows = Array.isArray(source.rows) ? source.rows : [];
    const { subtotal: sub, tax } = globalThis.QuoteMath.totals(source), total = sub + tax;
    const after = row => globalThis.QuoteMath.after(row, source), rate = row => globalThis.QuoteMath.rate(row, source);
    return {
      quote_number: source.quoteNo,
      quote_type: source.type,
      quote_date: source.date,
      responsible: source.owner,
      responsible_phone: source.ownerPhone || "",
      customer: {
        sapo_id: source.customerId && !source.customerId.startsWith("local_") ? source.customerId : null,
        local_id: source.customerId?.startsWith("local_") ? source.customerId : null,
        name: source.customer,
        tax_code: source.customerTaxCode || "",
        customer_code: source.customerCode || "",
        established_date: source.customerEstablishedDate || "",
        address: source.customerAddress || "",
        customer_type: source.customerType || "",
        discounts: source.customerDiscounts || {},
        contact: source.contact,
        contact_name: source.contact,
        phone: source.phone,
        contact_phone: source.phone,
        email: source.email,
      },
      items: rows.map((r, i) => {
        const cartons = r.perCarton ? Math.ceil(Number(r.qty || 0) / Number(r.perCarton || 1)) : 0, priceAfter = after(r);
        return {
          line: i + 1,
          tax_percent: rate(r),
          price_policy: r.pricePolicy || "",
          sku: r.sku,
          name: r.name,
          description: r.description || "",
          bundle_contents: r.bundleContents || "",
          print_description: r.printDescription || "",
          packaging_description: r.packagingDescription || "theo tiêu chuẩn nhà sản xuất",
          unit: r.unit,
          quantity: r.qty,
          unit_price: r.price,
          unit_price_manual: Boolean(r.manualPrice),
          discount_type: r.discountType || "percent",
          discount_percent: r.discountType === "amount" ? 0 : (Number.isFinite(Number(r.discount)) ? Number(r.discount) : 0),
          discount_amount: r.discountType === "amount" ? r.discount : r.price * r.discount / 100,
          print_fee: r.printFee,
          price_after_discount: priceAfter,
          line_total: priceAfter * r.qty,
          status: r.status || "Đợi triển khai",
          delivery_date: r.deliveryDate || "",
          cartons,
          weight_kg: cartons * Number(r.cartonWeight || 0),
          image_url: String(r.image || "").startsWith("data:") ? "[uploaded-on-device]" : (r.image || ""),
        };
      }),
      vat_percent: new Set(rows.map(row => rate(row))).size > 1 ? null : (rows.length ? rate(rows[0]) : source.vat),
      vat_amount: tax,
      subtotal: sub,
      subtotal_before_vat: sub,
      total,
      total_in_words: globalThis.HrcPdf?.amountInWords(total) || '',
      notes: source.notes,
      contract_number: source.contractDocument?.contractNumber || source.contractNumber || "",
      so_hd: source.soHd || "",
      legal_entity: source.legalEntity || "",
      payment_days: source.paymentDays ?? "",
      delivery_date: source.deliveryDate || "",
      customer_tax_code: source.customerTaxCode || "",
      collection_account_name: source.collectionAccountName || "",
      payment: source.payment || "",
      deposit: source.deposit || "",
      delivery: source.delivery || "",
    };
  }
  export function applyDetailsToQuote(q, details) {
    q.customer = { ...(q.customer || {}), name: details.name, tax_code: details.taxCode, customer_code: details.customerCode, address: details.address, contact_name: details.representativeName };
    q.contractDetails = { deliveryAddress: details.deliveryAddress, deliveryTime: details.deliveryTime, paymentMethod: details.paymentMethod, depositRate: details.depositRate, paymentDays: details.paymentDays };
    const keepNote = line => !/(tạm ứng|đặt cọc|thanh toán trước|thanh toán lần 1|\blần 1\b|ứng trước|còn lại)/i.test(line);
    const baseNotes = String(q.notes||'').split(/\r?\n/).map(s=>s.replace(/^\s*[-–]\s*/, '').trim()).filter(Boolean).filter(keepNote).map(line => `- ${line}`).join("\n");
    q.notes = `${baseNotes}\n- Thời gian giao hàng: ${details.deliveryTime}\n- Địa điểm giao hàng: ${details.deliveryAddress}\n- Phương thức thanh toán: ${details.paymentMethod}\n- Thanh toán trước ${details.depositRate}%`;
    return q;
  }
