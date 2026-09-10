      list: results.slice(0, 50)
    });
  });

  // 9.3.b Endpoint Inbound para o N8N Criar uma OS (POST /api/n8n/webhook/order-create)
  app.post(['/api/n8n/webhook/order-create', '/api/n8n/orders/create'], async (req, res) => {
    if (!validateN8nAuth(req)) {
      return res.status(401).json({
        success: false,
        error: 'Não autorizado: Token/API Key do N8N inválida.',
      });
    }

    const {
      callNumber,
      customerName,
      customerPhone,
      serviceCategory,
      technicianPhone,
      city,
      neighborhood,
      addressStreet,
      addressNumber,
      status,
      observation
    } = req.body || {};

    if (!customerName) {
      return res.status(400).json({ success: false, error: 'O nome do cliente (customerName) é obrigatório.' });
    }

    try {
      let technicianId = null;
      let technicianName = 'Técnico Não Definido';
      
      if (technicianPhone) {
        const cleanPhone = String(technicianPhone).replace(/\D/g, '');
        const foundTech = memUsers.find(u => {
          const uPhone = (u.phone || '').replace(/\D/g, '');
          return uPhone.length >= 8 && (uPhone.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(uPhone.slice(-8)));
        });
        if (foundTech) {
          technicianId = foundTech.id;
          technicianName = foundTech.name;
        } else {
          const defaultTech = memUsers.find(u => u.status === 'ACTIVE' && u.role === 'TECHNICIAN');
          if (defaultTech) {
            technicianId = defaultTech.id;
            technicianName = defaultTech.name;
          }
        }
      } else {
        const defaultTech = memUsers.find(u => u.status === 'ACTIVE' && u.role === 'TECHNICIAN');
        if (defaultTech) {
          technicianId = defaultTech.id;
          technicianName = defaultTech.name;
        }
      }

      const osDate = new Date();
      const newCallNumber = callNumber || `PS-${osDate.getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      const newId = `os-${newCallNumber.toLowerCase()}-${Date.now()}`;
      
      const newOrder: any = {
        id: newId,
        callNumber: newCallNumber,
        customerName: customerName,
        customerPhone: customerPhone || '',
        serviceCategory: serviceCategory || 'Higienização / Instalação',
        technicianId: technicianId,
        technicianName: technicianName,
        city: city || 'São Paulo',
        neighborhood: neighborhood || 'A definir',
        addressStreet: addressStreet || 'A definir',
        addressNumber: addressNumber || 'S/N',
        status: status || 'IN_PROGRESS',
        observation: observation || 'Aberta via WhatsApp pelo técnico',
        scheduledDate: osDate.toISOString(),
        createdAt: osDate.toISOString(),
        kmTraveled: 0,
        kmCost: 0,
        tollCost: 0,
        supportCost: 0,
        totalCost: 0,
        totalTechnicianGross: 0,
        baseServiceFee: 0,
        faturamentoPorto: 0,
        startedAt: status === 'IN_PROGRESS' || status === 'COMPLETED' ? osDate.toISOString() : null,
      };

      const formatDbDate = (iso: string | null) => {
        if (!iso) return null;
        const d = new Date(iso);
        return !isNaN(d.getTime()) ? d.toISOString().slice(0, 19).replace('T', ' ') : null;
      };

      const db = getDbPool();
      await db.execute(
        `INSERT INTO service_orders (
          id, call_number, customer_name, customer_phone, service_category, 
          technician_id, city, neighborhood, address_street, address_number, 
          status, scheduled_date, created_at, started_at, execution_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newOrder.id,
          newOrder.callNumber,
          newOrder.customerName,
          newOrder.customerPhone,
          newOrder.serviceCategory,
          newOrder.technicianId,
          newOrder.city,
          newOrder.neighborhood,
          newOrder.addressStreet,
          newOrder.addressNumber,
          newOrder.status,
          formatDbDate(newOrder.scheduledDate),
          formatDbDate(newOrder.createdAt),
          formatDbDate(newOrder.startedAt),
          newOrder.observation
        ]
      );

      memOrders.unshift(newOrder);

      await recordAudit({
        userId: 'n8n-bot',
        userName: 'N8N WhatsApp Bot',
        userRole: 'OPERATIONAL',
        ipAddress: req.ip,
        module: 'SERVICE_ORDERS',
        action: 'OS_CREATE',
        affectedRecordId: newOrder.id,
        affectedRecordType: 'service_order',
        result: 'SUCCESS',
        details: `OS ${newOrder.callNumber} criada via N8N/WhatsApp. Cliente: ${newOrder.customerName}, Técnico: ${technicianName}`,
      });

      console.log(`[N8N Webhook] OS ${newOrder.callNumber} (ID: ${newOrder.id}) criada com sucesso no MariaDB.`);

      res.json({
        success: true,
        message: 'OS criada com sucesso',
        data: newOrder
      });

    } catch (err: any) {
      console.error(`[N8N Webhook ERROR] Falha ao criar OS:`, err?.message || err);
      res.status(500).json({ success: false, error: 'Falha ao criar OS no banco de dados: ' + (err?.message || JSON.stringify(err)) });
    }
  });

  // 9.3 Endpoint Inbound para o N8N Atualizar ou Concluir uma OS (POST /api/n8n/webhook/order-update)
  app.post(['/api/n8n/webhook/order-update', '/api/n8n/orders/update'], async (req, res) => {
    if (!validateN8nAuth(req)) {
      return res.status(401).json({
        success: false,
        error: 'Não autorizado: Token/API Key do N8N inválida.',
      });
    }

    const {
