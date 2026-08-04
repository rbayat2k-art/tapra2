import React, { useState } from 'react';
import { PaymentRequest, User, RequestStatus, AttachmentFile, RequestBatchItem } from '../types';
import { formatRial, numberToPersianWords } from '../utils/numberToWords';
import { getJalaliNow } from '../utils/persianDate';
import { 
  X, CheckCircle2, Clock, RefreshCw, RotateCcw, XCircle, 
  Send, Upload, Printer, Building, MapPin, 
  User as UserIcon, Calendar, CreditCard, FileText, 
  Paperclip, Image as ImageIcon, MessageSquare, AlertCircle, Phone,
  Edit3, Trash2
} from 'lucide-react';

interface RequestDetailModalProps {
  request: PaymentRequest | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  users: User[];
  onUpdateRequest: (updatedReq: PaymentRequest) => void;
  onDeleteRequest?: (requestId: string) => void;
  onOpenPrintModal: (req: PaymentRequest) => void;
}

export const RequestDetailModal: React.FC<RequestDetailModalProps> = ({
  request,
  isOpen,
  onClose,
  currentUser,
  users,
  onUpdateRequest,
  onDeleteRequest,
  onOpenPrintModal
}) => {
  const [commentText, setCommentText] = useState('');
  const [selectedForwardUserId, setSelectedForwardUserId] = useState(users[0]?.id || '');
  const [returnReason, setReturnReason] = useState('');
  const [showReturnInput, setShowReturnInput] = useState(false);

  // Optional amount correction available to the current approver while using "تایید و ارجاع".
  // Defaults to the request's current amount; only applied if the approver actually changes it.
  const [correctedAmount, setCorrectedAmount] = useState<number>(0);

  // Per-row optional rejection reason input for consolidated/batch requests
  const [batchRejectReasons, setBatchRejectReasons] = useState<Record<string, string>>({});
  
  // Edit Mode State for Requestor
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editCardNumber, setEditCardNumber] = useState('');
  const [editAccountName, setEditAccountName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Per-row editable fields for consolidated/batch requests (title/amount/destinationName/destinationCard),
  // used instead of the single title/amount fields above when editing a request with batchItems.
  interface EditableBatchItem {
    id: string;
    title: string;
    amount: string;
    destinationName: string;
    destinationCard: string;
  }
  const [editBatchItems, setEditBatchItems] = useState<EditableBatchItem[]>([]);

  // Payment Receipt Upload State
  const [receiptFile, setReceiptFile] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cancellation Request State
  const [showCancellationInput, setShowCancellationInput] = useState(false);
  const [cancellationReasonInput, setCancellationReasonInput] = useState('');
  const [selectedDelegatedUserId, setSelectedDelegatedUserId] = useState<string>('');

  // Users this approver is allowed to forward/approve requests to. Falls back to
  // everyone except themself if the admin hasn't configured a restricted list yet.
  const forwardTargetUsers = (currentUser?.allowedApproverIds && currentUser.allowedApproverIds.length > 0)
    ? users.filter(u => currentUser!.allowedApproverIds!.includes(u.id))
    : users.filter(u => u.id !== currentUser?.id);

  // Sync edit state when modal opens or request changes
  React.useEffect(() => {
    if (request) {
      setEditTitle(request.title);
      setEditAmount(request.amount);
      setCorrectedAmount(request.amount);
      setEditCardNumber(request.destinationCardNumber);
      setEditAccountName(request.destinationAccountName);
      setEditDescription(request.description);
      setEditBatchItems((request.batchItems || []).map(bi => ({
        id: bi.id,
        title: bi.title,
        amount: String(bi.amount),
        destinationName: bi.destinationName,
        destinationCard: bi.destinationCard
      })));
      setIsEditing(false);
      setShowCancellationInput(false);
      setCancellationReasonInput('');
      const firstExec = users.find(u => u.role === 'treasury_executor' || u.roleTitle?.includes('مجری')) || users[0];
      setSelectedDelegatedUserId(firstExec?.id || '');
      setSelectedForwardUserId(forwardTargetUsers[0]?.id || users[0]?.id || '');
    }
  }, [request, users, currentUser]);

  if (!isOpen || !request) return null;

  // Role & Action Permissions
  const isRequestorRole = currentUser?.role === 'requestor';
  const isOwnerRequestor = request.requestorId === currentUser?.id || request.requestorName === currentUser?.fullName || currentUser?.role === 'admin';
  const isApproverRole = currentUser?.role === 'approver';
  const isTreasuryExecRole = currentUser?.role === 'treasury_executor';
  const isAdminRole = currentUser?.role === 'admin' || currentUser?.roleTitle?.includes('مدیر خزانه‌داری');

  // Check if any approver has acted on it yet
  const hasBeenProcessedByApprovers = request.timeline.some(t => t.action === 'approved' || t.action === 'forwarded' || t.action === 'paid');

  // Only the person the request is CURRENTLY sitting with may act on it - this prevents
  // a request from being approved/ticked more than once by people earlier in the chain.
  const isCurrentResponsibleParty = !!currentUser && request.currentApproverId === currentUser.id;

  const canEditOrDeleteInitial = isOwnerRequestor && request.status === 'pending_approval' && !hasBeenProcessedByApprovers;
  const canEditOrDeleteReturned = isOwnerRequestor && request.status === 'returned';
  const canRequestCancellation = isOwnerRequestor && (request.status === 'pending_approval' || request.status === 'approved_pending_payment') && hasBeenProcessedByApprovers && !request.cancellationRequested;
  const canResubmit = !isSubmitting && isOwnerRequestor && request.status === 'returned';

  const canApproveAndForward = !isSubmitting && (isApproverRole || isAdminRole) && isCurrentResponsibleParty && request.status === 'pending_approval';
  const canFinalApproveTreasury = !isSubmitting && (isAdminRole || isTreasuryExecRole) && isCurrentResponsibleParty && request.status === 'pending_approval';
  const canMarkPaid = !isSubmitting && (isTreasuryExecRole || isAdminRole) && isCurrentResponsibleParty && (request.status === 'approved_pending_payment' || request.status === 'pending_approval' || request.status === 'paid');
  const canReturnOrReject = !isSubmitting && (isApproverRole || isAdminRole || isTreasuryExecRole) && isCurrentResponsibleParty && (request.status === 'pending_approval' || request.status === 'approved_pending_payment');
  const canDelegateExecution = !isSubmitting && (isAdminRole || currentUser?.roleTitle?.includes('مدیر ارشد')) && (request.status === 'approved_pending_payment' || request.status === 'pending_approval');

  // Consolidated / Batch Request Row-Level Approval
  const hasBatchItems = !!request.batchItems && request.batchItems.length > 0;
  const allBatchItemsDecided = !hasBatchItems || request.batchItems!.every(bi => bi.status !== 'pending');

  // The row-level batch edit form only replaces the single title/amount edit form while the
  // request is still in its pre-approval editable window (canEditOrDeleteInitial); a returned
  // batch request falls back to the existing single-field edit form untouched.
  const isBatchEditMode = hasBatchItems && canEditOrDeleteInitial;

  const updateEditBatchItem = (id: string, field: 'title' | 'amount' | 'destinationName' | 'destinationCard', val: string) => {
    setEditBatchItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      if (field === 'amount') return { ...item, amount: val.replace(/\D/g, '') };
      return { ...item, [field]: val };
    }));
  };

  const editBatchTotalAmount = editBatchItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  // Undo / Revert Action Permissions
  const lastTimelineEntry = request.timeline[request.timeline.length - 1];
  
  // 1. Undo forward/approval before downstream action
  const canUndoLastApproval = !isSubmitting && !!currentUser && !!lastTimelineEntry &&
    lastTimelineEntry.actorId === currentUser.id &&
    !lastTimelineEntry.reverted &&
    (lastTimelineEntry.action === 'forwarded' || lastTimelineEntry.action === 'approved') &&
    !isCurrentResponsibleParty &&
    (request.status === 'pending_approval' || request.status === 'approved_pending_payment') &&
    (isApproverRole || isTreasuryExecRole || isAdminRole);

  // 2. Explicit Revert Financial Approval (بازگشت از تایید مالی)
  const canUndoFinancialApproval = !isSubmitting && (isAdminRole || isTreasuryExecRole || isApproverRole) &&
    request.status === 'approved_pending_payment';

  // 3. Revert Paid Status (بازگشت از ثبت واریز)
  const canUndoPayment = !isSubmitting && (isAdminRole || isTreasuryExecRole) &&
    request.status === 'paid';

  // 4. Revert Return Status (بازگشت از عودت)
  const canUndoReturn = !isSubmitting && (isAdminRole || isApproverRole || isTreasuryExecRole) &&
    request.status === 'returned';

  const handleSaveEdit = () => {
    if (isBatchEditMode) {
      if (editBatchTotalAmount <= 0) {
        alert('لطفاً برای حداقل یکی از ردیف‌های درخواست تجمیعی، مبلغ معتبر بزرگ‌تر از صفر وارد کنید.');
        return;
      }
    } else if (!editTitle.trim() || !editAmount || editAmount <= 0) {
      alert('لطفاً عنوان و مبلغ معتبر وارد کنید.');
      return;
    }

    const isResubmitting = request.status === 'returned';

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorName: currentUser?.fullName || request.requestorName,
        actorRole: currentUser?.roleTitle || 'ثبت‌کننده',
        action: isResubmitting ? ('submitted' as const) : ('forwarded' as const),
        actionTitle: isResubmitting ? 'اصلاح و ثبت مجدد درخواست' : (isBatchEditMode ? 'ویرایش ردیف‌های درخواست تجمیعی' : 'ویرایش اطلاعات درخواست'),
        timestamp: getJalaliNow(),
        comment: isResubmitting
          ? 'اطلاعات درخواست اصلاح گردید و مجدداً جهت بررسی ارسال شد.'
          : (isBatchEditMode ? 'ردیف‌های درخواست تجمیعی توسط ثبت‌کننده اصلاح و مبلغ کل درخواست بازمحاسبه شد.' : 'ویرایش جزئیات درخواست توسط ثبت‌کننده.')
      }
    ];

    // request.id and request.trackingCode are never included in either branch below,
    // so the ...request spread always preserves them unchanged.
    let updated: PaymentRequest;

    if (isBatchEditMode) {
      const updatedBatchItems: RequestBatchItem[] = request.batchItems!.map(bi => {
        const edited = editBatchItems.find(e => e.id === bi.id);
        if (!edited) return bi;
        const amt = parseFloat(edited.amount) || 0;
        return {
          ...bi,
          title: edited.title.trim() || 'پرداخت بابت فاکتور',
          amount: amt,
          amountInWords: numberToPersianWords(amt),
          destinationName: edited.destinationName.trim() || 'صاحب حساب',
          destinationCard: edited.destinationCard.trim() || '-'
        };
      });
      const totalAmount = updatedBatchItems.reduce((sum, bi) => sum + bi.amount, 0);

      updated = {
        ...request,
        amount: totalAmount,
        amountInWords: numberToPersianWords(totalAmount),
        batchItems: updatedBatchItems,
        status: 'pending_approval',
        updatedAt: getJalaliNow(),
        timeline: updatedTimeline
      };
    } else {
      updated = {
        ...request,
        title: editTitle.trim(),
        amount: Number(editAmount),
        amountInWords: `${editAmount.toLocaleString('fa-IR')} ریال`,
        destinationCardNumber: editCardNumber.trim(),
        destinationAccountName: editAccountName.trim(),
        description: editDescription.trim(),
        status: 'pending_approval',
        updatedAt: getJalaliNow(),
        timeline: updatedTimeline
      };
    }

    onUpdateRequest(updated);
    setIsEditing(false);
    alert(isResubmitting ? 'درخواست شما با موفقیت اصلاح و مجدداً جهت بررسی ارسال گردید.' : 'تغییرات با موفقیت ذخیره شد.');
  };

  const handleDelete = () => {
    if (confirm(`آیا از لغو و حذف کامل درخواست با کد پیگیری ${request.trackingCode} اطمینان دارید؟`)) {
      if (onDeleteRequest) {
        onDeleteRequest(request.id);
      }
    }
  };

  const handleFileUploadReceipt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReceiptFile(event.target?.result as string);
        setReceiptFileName(file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  // Action Handlers
  const handleApproveAndForward = () => {
    if (isSubmitting) return;
    if (forwardTargetUsers.length === 0) {
      alert('هیچ مقصد مجازی برای ارجاع این درخواست تعریف نشده است. لطفاً با ادمین سیستم تماس بگیرید.');
      return;
    }

    // Amount correction is optional: only validated/applied if the approver actually
    // changed it away from the request's current amount (so info_request's amount=0,
    // and every other unmodified case, is left completely untouched).
    const isAmountCorrected = correctedAmount !== request.amount;
    if (isAmountCorrected && (!correctedAmount || correctedAmount <= 0)) {
      alert('مبلغ اصلاح‌شده باید عددی بزرگ‌تر از صفر باشد.');
      return;
    }

    setIsSubmitting(true);

    const nextUser = forwardTargetUsers.find(u => u.id === selectedForwardUserId) || forwardTargetUsers[0];
    const actorName = currentUser?.fullName || 'تاییدکننده';
    const actorRole = currentUser?.roleTitle || 'مدیر مربوطه';

    const amountCorrectionNote = isAmountCorrected
      ? `اصلاح مبلغ توسط تاییدکننده: از ${formatRial(request.amount)} به ${formatRial(correctedAmount)} تغییر یافت.`
      : undefined;

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser?.id,
        actorName,
        actorRole,
        action: 'forwarded' as const,
        actionTitle: 'تایید و ارجاع به مرحله بعد',
        nextActorName: nextUser.fullName,
        timestamp: getJalaliNow(),
        comment: commentText.trim() || `درخواست با تایید به ${nextUser.fullName} ارجاع داده شد.`,
        amountCorrectionNote
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      amount: isAmountCorrected ? correctedAmount : request.amount,
      amountInWords: isAmountCorrected ? numberToPersianWords(correctedAmount) : request.amountInWords,
      currentApproverId: nextUser.id,
      currentApproverName: nextUser.fullName,
      currentApproverPhone: nextUser.phone,
      status: 'pending_approval',
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setCommentText('');
    setIsSubmitting(false);
    alert(isAmountCorrected
      ? `درخواست با موفقیت تایید، مبلغ به ${formatRial(correctedAmount)} اصلاح و به ${nextUser.fullName} ارجاع گردید.`
      : `درخواست با موفقیت تایید و به ${nextUser.fullName} ارجاع گردید.`);
  };

  // Undo a mistaken approve & forward / final approval - only possible if the next
  // person in the chain hasn't acted on the request yet.
  const handleUndoApproval = () => {
    if (isSubmitting || !currentUser || !lastTimelineEntry) return;
    setIsSubmitting(true);

    const updatedTimeline = request.timeline.map((t, idx) =>
      idx === request.timeline.length - 1 ? { ...t, reverted: true } : t
    );
    updatedTimeline.push({
      id: `tl_${Date.now()}`,
      actorId: currentUser.id,
      actorName: currentUser.fullName,
      actorRole: currentUser.roleTitle,
      action: 'undone' as const,
      actionTitle: 'بازگشت از تایید و ارجاع قبلی',
      timestamp: getJalaliNow(),
      comment: 'تاییدکننده، اقدام قبلی خود را پیش از انجام کاری توسط نفر بعدی لغو و درخواست را نزد خود بازگرداند.'
    });

    const updated: PaymentRequest = {
      ...request,
      currentApproverId: currentUser.id,
      currentApproverName: currentUser.fullName,
      currentApproverPhone: currentUser.phone,
      status: 'pending_approval',
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setIsSubmitting(false);
    alert('تایید قبلی با موفقیت لغو شد و درخواست مجدداً نزد شما قرار گرفت.');
  };

  // Undo Financial Approval (بازگشت از تایید مالی خزانه‌داری)
  const handleUndoFinancialApproval = () => {
    if (isSubmitting || !currentUser) return;
    setIsSubmitting(true);

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: currentUser.roleTitle,
        action: 'undone' as const,
        actionTitle: 'بازگشت از تایید مالی خزانه‌داری',
        timestamp: getJalaliNow(),
        comment: 'تاییدکننده مالی، تاییدیه خزانه‌داری را لغو کرد و درخواست را به وضعیت در انتظار تایید و بررسی بازگرداند.'
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      currentApproverId: currentUser.id,
      currentApproverName: currentUser.fullName,
      currentApproverPhone: currentUser.phone,
      status: 'pending_approval',
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setIsSubmitting(false);
    alert('تایید مالی با موفقیت لغو گردید و درخواست به کارتابل در انتظار تایید بازگشت.');
  };

  // Undo Payment Completion (بازگشت از ثبت واریز بانکی)
  const handleUndoPayment = () => {
    if (isSubmitting || !currentUser) return;
    setIsSubmitting(true);

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: currentUser.roleTitle,
        action: 'undone' as const,
        actionTitle: 'بازگشت از تسویه و ثبت واریز بانکی',
        timestamp: getJalaliNow(),
        comment: 'مسئول اجرا/خزانه‌داری ثبت تسویه را لغو کرد و پرونده به حالت در انتظار واریز بازگشت.'
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      status: 'approved_pending_payment',
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setIsSubmitting(false);
    alert('ثبت تسویه با موفقیت لغو شد و درخواست به وضعیت آماده واریز بازگشت.');
  };

  // Undo Return (بازگشت از عودت درخواست)
  const handleUndoReturn = () => {
    if (isSubmitting || !currentUser) return;
    setIsSubmitting(true);

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: currentUser.roleTitle,
        action: 'undone' as const,
        actionTitle: 'لغو عودت و بازگشت به جریان بررسی',
        timestamp: getJalaliNow(),
        comment: 'بررسی‌کننده عودت قبلی را لغو کرد و درخواست مجدداً در جریان بررسی قرار گرفت.'
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      status: 'pending_approval',
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setIsSubmitting(false);
    alert('وضعیت عودت لغو شد و درخواست مجدداً به جریان بررسی بازگشت.');
  };

  const handleFinalApproval = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const actorName = currentUser?.fullName || 'رضا بیات';
    const actorRole = currentUser?.roleTitle || 'مدیر خزانه‌داری';
    const executor = users.find(u => u.role === 'treasury_executor') || users[0];

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser?.id,
        actorName,
        actorRole,
        action: 'approved' as const,
        actionTitle: 'تایید نهایی خزانه‌داری و آماده واریز',
        nextActorName: executor.fullName,
        timestamp: getJalaliNow(),
        comment: commentText.trim() || 'درخواست تایید نهایی گردید و برای واریز به کارمند اجرا ارجاع شد.'
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      currentApproverId: executor.id,
      currentApproverName: executor.fullName,
      currentApproverPhone: executor.phone,
      status: 'approved_pending_payment',
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setCommentText('');
    setIsSubmitting(false);
    alert('تایید نهایی خزانه‌داری با موفقیت ثبت شد.');
  };

  const handleMarkPaid = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const actorName = currentUser?.fullName || 'امیرحسین رضایی';
    const actorRole = currentUser?.roleTitle || 'کارمند اجرا';

    let receiptAttachment: AttachmentFile | undefined = request.paymentReceiptAttachment;
    if (receiptFile) {
      receiptAttachment = {
        id: `att_rcpt_${Date.now()}`,
        name: receiptFileName || 'عکس_فیش_واریزی_بانک.jpg',
        url: receiptFile,
        type: 'image/jpeg',
        size: 1024000,
        uploadedAt: getJalaliNow()
      };
    } else {
      receiptAttachment = {
        id: `att_rcpt_${Date.now()}`,
        name: 'فیش_واریز_پایا.jpg',
        url: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80',
        type: 'image/jpeg',
        size: 1024000,
        uploadedAt: getJalaliNow()
      };
    }

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser?.id,
        actorName,
        actorRole,
        action: 'paid' as const,
        actionTitle: 'واریز بانکی انجام شد و فیش آپلود گردید',
        timestamp: getJalaliNow(),
        comment: commentText.trim() || 'عملیات واریز وجه انجام و تصویر فیش واریز در سیستم بایگانی شد.'
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      status: 'paid',
      paymentReceiptAttachment: receiptAttachment,
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setCommentText('');
    setIsSubmitting(false);
    alert('تایید واریز وجه و بایگانی فیش با موفقیت انجام شد!');
  };

  const handleReturnForCorrection = () => {
    if (!returnReason.trim()) {
      alert('لطفاً علت عودت و ایراد درخواست را بنویسید.');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    const actorName = currentUser?.fullName || 'بررسی کننده';
    const actorRole = currentUser?.roleTitle || 'مسئول بررسی';

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser?.id,
        actorName,
        actorRole,
        action: 'returned' as const,
        actionTitle: 'عودت درخواست جهت اصلاح ایراد',
        timestamp: getJalaliNow(),
        comment: `علت عودت: ${returnReason.trim()}`
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      status: 'returned',
      returnReason: returnReason.trim(),
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setShowReturnInput(false);
    setReturnReason('');
    setIsSubmitting(false);
    alert('درخواست با موفقیت عودت داده شد.');
  };

  const handleRejectRequest = () => {
    if (!returnReason.trim()) {
      alert('لطفاً دلیل رد درخواست را وارد کنید.');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    const actorName = currentUser?.fullName || 'رضا بیات';
    const actorRole = currentUser?.roleTitle || 'مدیر خزانه‌داری';

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser?.id,
        actorName,
        actorRole,
        action: 'rejected' as const,
        actionTitle: 'رد درخواست پرداخت',
        timestamp: getJalaliNow(),
        comment: `دلیل رد: ${returnReason.trim()}`
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      status: 'rejected',
      rejectionReason: returnReason.trim(),
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setShowReturnInput(false);
    setReturnReason('');
    setIsSubmitting(false);
    alert('درخواست رد شد.');
  };

  // Request Cancellation Handler for Requestor
  const handleSendCancellationRequest = () => {
    if (!cancellationReasonInput.trim()) {
      alert('لطفاً علت درخواست انصراف و لغو پرداخت را ذکر کنید.');
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);

    const actorName = currentUser?.fullName || request.requestorName;
    const actorRole = currentUser?.roleTitle || 'ثبت‌کننده';

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser?.id,
        actorName,
        actorRole,
        action: 'commented' as const,
        actionTitle: 'ثبت درخواست لغو و انصراف توسط متقاضی',
        timestamp: getJalaliNow(),
        comment: `علت درخواست لغو: ${cancellationReasonInput.trim()}`
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      cancellationRequested: true,
      cancellationReason: cancellationReasonInput.trim(),
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setShowCancellationInput(false);
    setCancellationReasonInput('');
    setIsSubmitting(false);
    alert('درخواست انصراف شما با موفقیت ثبت شد و جهت ابطال به تاییدکننده/خزانه‌داری اطلاع داده شد.');
  };

  // Approver / Treasury Approve Cancellation
  const handleApproveCancellation = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const actorName = currentUser?.fullName || 'تاییدکننده';
    const actorRole = currentUser?.roleTitle || 'مسئول بررسی';

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser?.id,
        actorName,
        actorRole,
        action: 'rejected' as const,
        actionTitle: 'موافقت با درخواست لغو و ابطال پرونده',
        timestamp: getJalaliNow(),
        comment: `درخواست لغو ثبت‌کننده تایید گردید. علت: ${request.cancellationReason || 'تقاضای متقاضی'}`
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      status: 'rejected',
      rejectionReason: `ابطال بر اساس درخواست انصراف کاربر: ${request.cancellationReason || 'تقاضای متقاضی'}`,
      cancellationRequested: false,
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setIsSubmitting(false);
    alert('با درخواست لغو موافقت شد و درخواست ابطال گردید.');
  };

  // Approver / Treasury Reject Cancellation (Continue process)
  const handleRejectCancellation = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const actorName = currentUser?.fullName || 'تاییدکننده';
    const actorRole = currentUser?.roleTitle || 'مسئول بررسی';

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser?.id,
        actorName,
        actorRole,
        action: 'forwarded' as const,
        actionTitle: 'مخالفت با لغو و ادامه جریان بررسی پرداخت',
        timestamp: getJalaliNow(),
        comment: 'درخواست لغو تایید نشد و روال بررسی پرداخت ادامه می‌یابد.'
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      cancellationRequested: false,
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setIsSubmitting(false);
    alert('با درخواست لغو مخالفت شد و روال پرداخت ادامه دارد.');
  };

  // Consolidated / Batch Request Row-Level Decision Handlers
  const canActOnBatchItems = !isSubmitting && !!currentUser && isCurrentResponsibleParty &&
    (isApproverRole || isAdminRole || isTreasuryExecRole) &&
    (request.status === 'pending_approval' || request.status === 'approved_pending_payment');

  const handleBatchItemApprove = (itemId: string) => {
    if (!canActOnBatchItems) return;
    const updatedBatchItems = (request.batchItems || []).map(bi =>
      bi.id === itemId
        ? {
            ...bi,
            status: 'approved' as const,
            decidedByUserId: currentUser?.id,
            decidedByName: currentUser?.fullName,
            decidedAt: getJalaliNow(),
            rejectionReason: undefined
          }
        : bi
    );
    onUpdateRequest({ ...request, batchItems: updatedBatchItems, updatedAt: getJalaliNow() });
  };

  const handleBatchItemReject = (itemId: string) => {
    if (!canActOnBatchItems) return;
    const reason = (batchRejectReasons[itemId] || '').trim();
    if (!reason) {
      alert('لطفاً دلیل رد این ردیف را وارد کنید.');
      return;
    }
    const updatedBatchItems = (request.batchItems || []).map(bi =>
      bi.id === itemId
        ? {
            ...bi,
            status: 'rejected' as const,
            decidedByUserId: currentUser?.id,
            decidedByName: currentUser?.fullName,
            decidedAt: getJalaliNow(),
            rejectionReason: reason
          }
        : bi
    );
    onUpdateRequest({ ...request, batchItems: updatedBatchItems, updatedAt: getJalaliNow() });
  };

  const handleBatchItemRevert = (itemId: string) => {
    if (!canActOnBatchItems) return;
    const updatedBatchItems = (request.batchItems || []).map(bi =>
      bi.id === itemId
        ? {
            ...bi,
            status: 'pending' as const,
            decidedByUserId: undefined,
            decidedByName: undefined,
            decidedAt: undefined,
            rejectionReason: undefined
          }
        : bi
    );
    onUpdateRequest({ ...request, batchItems: updatedBatchItems, updatedAt: getJalaliNow() });
  };

  // Senior Treasury Manager Delegation to Execution Specialist
  const handleDelegateExecution = () => {
    if (!selectedDelegatedUserId) {
      alert('لطفاً مسئول پرداخت خزانه‌داری را انتخاب کنید.');
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);

    const targetUser = users.find(u => u.id === selectedDelegatedUserId) || users[0];
    const actorName = currentUser?.fullName || 'رضا بیات';
    const actorRole = currentUser?.roleTitle || 'مدیر ارشد خزانه‌داری';

    const updatedTimeline = [
      ...request.timeline,
      {
        id: `tl_${Date.now()}`,
        actorId: currentUser?.id,
        actorName,
        actorRole,
        action: 'forwarded' as const,
        actionTitle: 'تخصیص و ارجاع پرداخت به مجری خزانه‌داری',
        nextActorName: targetUser.fullName,
        timestamp: getJalaliNow(),
        comment: `پرونده جهت اجرای واریز به ${targetUser.fullName} (${targetUser.roleTitle}) ارجاع گردید.`
      }
    ];

    const updated: PaymentRequest = {
      ...request,
      currentApproverId: targetUser.id,
      currentApproverName: targetUser.fullName,
      currentApproverPhone: targetUser.phone,
      delegatedToExecutorId: targetUser.id,
      delegatedToExecutorName: targetUser.fullName,
      status: 'approved_pending_payment',
      updatedAt: getJalaliNow(),
      timeline: updatedTimeline
    };

    onUpdateRequest(updated);
    setIsSubmitting(false);
    alert(`درخواست پرداخت با موفقیت به ${targetUser.fullName} (مجری واریز) ارجاع شد.`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full my-6 overflow-hidden text-right transform transition-all animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-indigo-600 text-white font-mono font-black text-sm px-3 py-1 rounded-xl shadow border border-indigo-400/40">
              کد پیگیری: {request.trackingCode}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-extrabold text-white">{request.title}</h2>
                {request.sourceSupportCaseTrackingCode && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">
                    عودت وجه — پرونده پشتیبانی {request.sourceSupportCaseTrackingCode}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                ثبت شده توسط {request.requestorName} | {request.createdAt}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenPrintModal(request)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-indigo-400" />
              <span>چاپ برگه پرداخت</span>
            </button>

            <button
              onClick={onClose}
              className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-6">

          {/* Cancellation Requested Alert Banner for Approvers & Treasury */}
          {request.cancellationRequested && (
            <div className="p-4 bg-rose-950/80 border-2 border-rose-500 rounded-2xl space-y-3 shadow-xl animate-pulse">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-black text-white">
                      ⚠️ متقاضی (کاربر ثبت‌کننده) درخواست انصراف و لغو این پرداخت را دارد!
                    </h4>
                    <p className="text-xs text-rose-200 mt-1">
                      علت انصراف اعلام شده: <strong className="text-white underline">{request.cancellationReason || 'تقاضای انصراف متقاضی'}</strong>
                    </p>
                  </div>
                </div>
              </div>

              {(isApproverRole || isTreasuryExecRole || isAdminRole) && (
                <div className="flex items-center gap-2 pt-2 border-t border-rose-800/80 justify-end">
                  <button
                    onClick={handleApproveCancellation}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl transition flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تایید لغو و ابطال کامل درخواست</span>
                  </button>
                  <button
                    onClick={handleRejectCancellation}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 text-slate-400" />
                    <span>مخالفت با لغو (ادامه بررسی)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Requestor Action Banner for Edit/Delete before processing or when returned */}
          {(canEditOrDeleteInitial || canEditOrDeleteReturned) && !isEditing && (
            <div className="p-4 bg-slate-950 border border-indigo-500/40 rounded-2xl flex items-center justify-between gap-3 flex-wrap shadow-lg">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center border border-indigo-500/30 shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-white">
                    {request.status === 'returned'
                      ? 'این درخواست عودت داده شده است و منتظر ویرایش و ارسال مجدد شماست'
                      : 'امکان ویرایش و یا حذف درخواست (پیش از بررسی تاییدکنندگان)'}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    شما می‌توانید مشخصات این درخواست را اصلاح کرده یا در صورت انصراف، آن را کلاً حذف نمایید.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>{request.status === 'returned' ? 'ویرایش و ارسال مجدد' : 'ویرایش درخواست'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-2 bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>انصراف و حذف درخواست</span>
                </button>
              </div>
            </div>
          )}

          {/* Request Cancellation Button for Requestor when already in progress */}
          {canRequestCancellation && !showCancellationInput && (
            <div className="p-3.5 bg-amber-950/40 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-amber-200">
                <span className="font-bold">درخواست در حال بررسی توسط تاییدکنندگان است.</span> اگر از پرداخت انصراف داده‌اید، می‌توانید درخواست لغو ارسال کنید.
              </div>
              <button
                type="button"
                onClick={() => setShowCancellationInput(true)}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow"
              >
                <XCircle className="w-4 h-4" />
                <span>درخواست انصراف و لغو این پرداخت</span>
              </button>
            </div>
          )}

          {/* Inline Cancellation Reason Input for Requestor */}
          {showCancellationInput && (
            <div className="p-4 bg-amber-950/70 border border-amber-500/50 rounded-2xl space-y-3">
              <h4 className="text-xs font-extrabold text-amber-200 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>ثبت فرم انصراف و لغو درخواست پرداخت</span>
              </h4>
              <textarea
                value={cancellationReasonInput}
                onChange={(e) => setCancellationReasonInput(e.target.value)}
                rows={2}
                placeholder="علت انصراف (مثلاً: لغو فاکتور توسط تامین‌کننده، اشتباه در مبلغ، یا تغییر شرایط...)"
                className="w-full bg-slate-900 text-white text-xs rounded-xl p-2.5 border border-amber-500/30 focus:outline-none focus:border-amber-400"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleSendCancellationRequest}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  ارسال درخواست انصراف به خزانه‌داری
                </button>
                <button
                  onClick={() => setShowCancellationInput(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-xl hover:bg-slate-700 cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </div>
          )}

          {/* Inline Edit Form when Requestor is Editing */}
          {isEditing && (
            <div className="p-5 bg-indigo-950/60 border border-indigo-500/40 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-indigo-500/30 pb-2.5">
                <h3 className="text-sm font-extrabold text-indigo-200 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-indigo-400" />
                  <span>ویرایش جزئیات درخواست پرداخت</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-slate-400 hover:text-white px-2.5 py-1 bg-slate-800 rounded-lg"
                >
                  انصراف از ویرایش
                </button>
              </div>

              {isBatchEditMode ? (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[11px] font-bold text-indigo-200">
                      ویرایش ردیف‌های درخواست تجمیعی ({editBatchItems.length} مورد)
                    </span>
                    <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                      مبلغ کل جدید: {formatRial(editBatchTotalAmount)}
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {editBatchItems.map((item, idx) => (
                      <div key={item.id} className="p-3 bg-slate-900 border border-slate-700/80 rounded-xl space-y-2">
                        <div className="text-[10px] font-bold text-indigo-300">ردیف {idx + 1}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1">عنوان ردیف</label>
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) => updateEditBatchItem(item.id, 'title', e.target.value)}
                              placeholder="پرداخت بابت فاکتور"
                              className="w-full bg-slate-950 text-white text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1">مبلغ به ریال</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={item.amount ? Number(item.amount).toLocaleString('en-US') : ''}
                              onChange={(e) => updateEditBatchItem(item.id, 'amount', e.target.value)}
                              className="w-full bg-slate-950 text-emerald-400 font-mono font-bold text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1">نام ذینفع</label>
                            <input
                              type="text"
                              value={item.destinationName}
                              onChange={(e) => updateEditBatchItem(item.id, 'destinationName', e.target.value)}
                              placeholder="صاحب حساب"
                              className="w-full bg-slate-950 text-white text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 mb-1">شماره کارت / شبا</label>
                            <input
                              type="text"
                              value={item.destinationCard}
                              onChange={(e) => updateEditBatchItem(item.id, 'destinationCard', e.target.value)}
                              placeholder="-"
                              className="w-full bg-slate-950 text-white font-mono text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">عنوان درخواست <span className="text-rose-400">*</span></label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">مبلغ به ریال <span className="text-rose-400">*</span></label>
                    <input
                      type="number"
                      value={editAmount || ''}
                      onChange={(e) => setEditAmount(Number(e.target.value))}
                      className="w-full bg-slate-900 text-emerald-400 font-mono font-bold text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">شماره کارت / حساب / شبا</label>
                    <input
                      type="text"
                      value={editCardNumber}
                      onChange={(e) => setEditCardNumber(e.target.value)}
                      className="w-full bg-slate-900 text-white font-mono text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">نام صاحب حساب</label>
                    <input
                      type="text"
                      value={editAccountName}
                      onChange={(e) => setEditAccountName(e.target.value)}
                      className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-300 mb-1">توضیحات و بابت درخواست</label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={2.5}
                      className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2 border-t border-indigo-500/20">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{request.status === 'returned' ? 'ذخیره و ارسال مجدد جهت تایید' : 'ذخیره تغییرات'}</span>
                </button>
              </div>
            </div>
          )}
          
          {/* Main Financial Attributes Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 bg-slate-950/80 rounded-2xl border border-slate-800">
            
            <div className="md:col-span-2 space-y-2">
              <div className="text-xs text-slate-400">مبلغ و مشخصات واریز:</div>
              <div className="text-xl font-mono font-black text-emerald-400 dir-ltr text-right">
                {formatRial(request.amount)}
              </div>
              <div className="text-xs font-bold text-slate-200">
                حروف: {request.amountInWords}
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-xs space-y-1">
                <div className="flex items-center gap-2 text-slate-300">
                  <CreditCard className="w-4 h-4 text-indigo-400" />
                  <span>شماره کارت/حساب: <strong className="font-mono text-white">{request.destinationCardNumber}</strong></span>
                </div>
                <div className="text-slate-300">
                  صاحب حساب: <strong className="text-slate-100">{request.destinationAccountName}</strong>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-r border-slate-800 pr-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">شرکت:</span>
                <span className="font-bold text-slate-200">{request.companyName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">مرکز هزینه / شعبه اصلی:</span>
                <span className="font-bold text-amber-300">{request.costCenterName}</span>
                {request.isMultiCostCenter && (
                  <span className="mt-1 inline-block text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                    🔀 تقسیم بین چند مرکز هزینه
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">درخواست‌کننده:</span>
                <span className="font-bold text-slate-200">{request.requestorName}</span>
                <span className="text-[10px] text-slate-400 block font-mono">{request.requestorPhone}</span>
              </div>
            </div>

          </div>

          {/* Multi Cost-Center Allocation Breakdown Table */}
          {request.isMultiCostCenter && request.costCenterAllocations && request.costCenterAllocations.length > 0 && (
            <div className="p-4 bg-slate-950/90 rounded-2xl border-2 border-indigo-500/40 space-y-3">
              <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2.5">
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-xs font-black text-white">جدول تفکیک سهم هزینه بین مراکز هزینه و شعب (Multi Cost-Center)</h4>
                </div>
                <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/20 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
                  تعداد مراكز: {request.costCenterAllocations.length} شعبه
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-900/80 text-slate-400 text-[10px] border-b border-slate-800">
                      <th className="p-2 font-bold">ردیف</th>
                      <th className="p-2 font-bold">شرکت</th>
                      <th className="p-2 font-bold">مرکز هزینه / شعبه</th>
                      <th className="p-2 font-bold">درصد سهم</th>
                      <th className="p-2 font-bold text-left">مبلغ سهم (ریال)</th>
                      <th className="p-2 font-bold">بابت / توضیحات سهم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {request.costCenterAllocations.map((alloc, idx) => {
                      const percent = request.amount > 0 ? Math.round((alloc.amount / request.amount) * 100) : 0;
                      return (
                        <tr key={alloc.id || idx} className="hover:bg-slate-900/50">
                          <td className="p-2 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                          <td className="p-2 font-bold text-slate-300">{alloc.companyName}</td>
                          <td className="p-2 font-black text-amber-300">{alloc.costCenterName}</td>
                          <td className="p-2 font-mono text-[11px] text-indigo-300">{percent}%</td>
                          <td className="p-2 font-mono font-bold text-emerald-400 text-left dir-ltr">{formatRial(alloc.amount)}</td>
                          <td className="p-2 text-slate-400 text-[11px]">{alloc.description || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Consolidated / Batch Request Row-Level Approval Table */}
          {hasBatchItems && (
            <div className="p-4 bg-slate-950/90 rounded-2xl border-2 border-amber-500/40 space-y-3">
              <div className="flex items-center justify-between border-b border-amber-500/20 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-black text-white">جدول ردیف‌های درخواست تجمیعی (تایید/رد ردیف به ردیف)</h4>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${allBatchItemsDecided ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-amber-300 bg-amber-500/20 border-amber-500/30'}`}>
                  {allBatchItemsDecided ? 'تمام ردیف‌ها تعیین تکلیف شدند' : `${request.batchItems!.filter(bi => bi.status === 'pending').length} ردیف در انتظار تصمیم`}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-900/80 text-slate-400 text-[10px] border-b border-slate-800">
                      <th className="p-2 font-bold">ردیف</th>
                      <th className="p-2 font-bold">عنوان</th>
                      <th className="p-2 font-bold text-left">مبلغ (ریال)</th>
                      <th className="p-2 font-bold">ذینفع</th>
                      <th className="p-2 font-bold">شماره کارت/شبا</th>
                      <th className="p-2 font-bold">وضعیت</th>
                      {canActOnBatchItems && <th className="p-2 font-bold">اقدام</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {request.batchItems!.map((bi, idx) => (
                      <tr key={bi.id || idx} className="hover:bg-slate-900/50 align-top">
                        <td className="p-2 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                        <td className="p-2 font-bold text-slate-200">{bi.title}</td>
                        <td className="p-2 font-mono font-bold text-emerald-400 text-left dir-ltr">{formatRial(bi.amount)}</td>
                        <td className="p-2 text-slate-300">{bi.destinationName}</td>
                        <td className="p-2 font-mono text-[11px] text-slate-300">{bi.destinationCard}</td>
                        <td className="p-2">
                          {bi.status === 'pending' && (
                            <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">در انتظار</span>
                          )}
                          {bi.status === 'approved' && (
                            <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">تایید شد</span>
                          )}
                          {bi.status === 'rejected' && (
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-full">رد شد</span>
                              {bi.rejectionReason && (
                                <p className="text-[10px] text-rose-300/80 max-w-[160px]">دلیل: {bi.rejectionReason}</p>
                              )}
                            </div>
                          )}
                        </td>
                        {canActOnBatchItems && (
                          <td className="p-2 min-w-[180px]">
                            {bi.status === 'pending' && (
                              <div className="space-y-1.5">
                                <input
                                  type="text"
                                  value={batchRejectReasons[bi.id] || ''}
                                  onChange={(e) => setBatchRejectReasons(prev => ({ ...prev, [bi.id]: e.target.value }))}
                                  placeholder="دلیل رد (در صورت رد ردیف)"
                                  className="w-full bg-slate-900 text-white text-[10px] rounded-lg px-2 py-1 border border-slate-700 focus:outline-none focus:border-rose-500"
                                />
                                <div className="flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleBatchItemApprove(bi.id)}
                                    className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>تایید ردیف</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleBatchItemReject(bi.id)}
                                    className="flex-1 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1"
                                  >
                                    <XCircle className="w-3 h-3" />
                                    <span>رد ردیف</span>
                                  </button>
                                </div>
                              </div>
                            )}
                            {bi.status === 'approved' && (
                              <button
                                type="button"
                                onClick={() => handleBatchItemRevert(bi.id)}
                                className="w-full py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold rounded-lg transition cursor-pointer border border-slate-700 flex items-center justify-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>بازگشت از تایید</span>
                              </button>
                            )}
                            {bi.status === 'rejected' && (
                              <button
                                type="button"
                                onClick={() => handleBatchItemRevert(bi.id)}
                                className="w-full py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold rounded-lg transition cursor-pointer border border-slate-700 flex items-center justify-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>بازگشت از رد</span>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!allBatchItemsDecided && (
                <p className="text-[10.5px] text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl p-2.5 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>پیش از تایید و ارجاع کل درخواست، باید تکلیف تمام ردیف‌های جدول بالا (تایید یا رد) مشخص شود.</span>
                </p>
              )}
            </div>
          )}

          {/* Description */}
          <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-800">
            <h4 className="text-xs font-bold text-slate-300 mb-1">بابت / توضیحات درخواست:</h4>
            <p className="text-xs text-slate-300 leading-relaxed">{request.description}</p>
          </div>

          {/* Attachments Section: Initial Invoices & Final Bank Receipt */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Initial Invoices */}
            <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700">
              <h4 className="text-xs font-bold text-slate-200 mb-3 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                تصاویر فاکتور و مدارک اولیه ({request.initialAttachments.length})
              </h4>

              <div className="space-y-2">
                {request.initialAttachments.map((att) => (
                  <div key={att.id} className="p-2 bg-slate-900 border border-slate-700/80 rounded-xl flex items-center gap-3">
                    <img src={att.url} alt={att.name} className="w-14 h-14 object-cover rounded-lg shrink-0 border border-slate-700" />
                    <div className="overflow-hidden flex-1">
                      <p className="text-xs font-bold text-slate-200 truncate">{att.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">تاریخ آپلود: {att.uploadedAt}</p>
                      <a href={att.url} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-400 hover:underline mt-1 inline-block">
                        مشاهده تصویر کامل
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bank Payment Receipt */}
            <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700">
              <h4 className="text-xs font-bold text-slate-200 mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                تصویر فیش واریزی خزانه‌داری
              </h4>

              {request.paymentReceiptAttachment ? (
                <div className="p-2 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-center gap-3">
                  <img src={request.paymentReceiptAttachment.url} alt="فیش واریز" className="w-14 h-14 object-cover rounded-lg shrink-0 border border-emerald-500/40" />
                  <div className="overflow-hidden flex-1">
                    <p className="text-xs font-bold text-emerald-300 truncate">{request.paymentReceiptAttachment.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">آپلود شده در: {request.paymentReceiptAttachment.uploadedAt}</p>
                    <a href={request.paymentReceiptAttachment.url} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-400 hover:underline mt-1 inline-block">
                      مشاهده فیش کامل
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center text-slate-400 text-xs">
                  <Clock className="w-6 h-6 mx-auto text-slate-500 mb-1" />
                  <span>هنوز فیش واریزی ثبت نشده است.</span>
                  
                  {/* Upload Receipt Button for Treasury */}
                  <div className="mt-3">
                    <label htmlFor="receipt-upload-input" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-xl cursor-pointer inline-flex items-center gap-1 transition shadow">
                      <Upload className="w-3.5 h-3.5" />
                      آپلود فیش واریزی بانک
                    </label>
                    <input
                      type="file"
                      id="receipt-upload-input"
                      accept="image/*"
                      onChange={handleFileUploadReceipt}
                      className="hidden"
                    />
                    {receiptFileName && (
                      <div className="mt-2 inline-flex items-center gap-2 p-1.5 bg-emerald-950 border border-emerald-500/40 rounded-xl text-xs text-emerald-300">
                        <span>فایل فیش: <strong>{receiptFileName}</strong></span>
                        <button
                          type="button"
                          onClick={() => { setReceiptFile(null); setReceiptFileName(''); }}
                          className="p-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg transition cursor-pointer"
                          title="پاک کردن فایل انتخاب شده"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Timeline History */}
          <div className="p-5 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                تاریخچه و سوابق گردش کار (امضاها و تاییدها)
              </h4>
              <span className="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-full font-bold">
                تعداد سوابق: {request.timeline.length} مورد (قابلیت اسکرول)
              </span>
            </div>

            {/* Scrollable Timeline Box displaying max ~2 records initially */}
            <div className="max-h-56 overflow-y-auto pr-1 pl-1 space-y-3 relative before:absolute before:top-2 before:bottom-2 before:right-3.5 before:w-0.5 before:bg-slate-800 scrollbar-thin scrollbar-thumb-slate-700">
              {request.timeline.map((step) => (
                <div key={step.id} className="relative pr-8">
                  <div className={`absolute right-2 top-1.5 w-3 h-3 rounded-full ring-4 ring-slate-900 ${step.reverted ? 'bg-slate-600' : 'bg-indigo-500'}`} />
                  <div className={`p-3 bg-slate-900 border rounded-xl ${step.reverted ? 'border-slate-700 opacity-60' : 'border-slate-800'}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">{step.actorName} ({step.actorRole})</span>
                      <span className="text-[10px] text-slate-500">{step.timestamp}</span>
                    </div>
                    <div className={`text-xs font-medium mt-1 flex items-center gap-1.5 ${step.reverted ? 'text-slate-500 line-through' : 'text-indigo-300'}`}>
                      <span>{step.actionTitle}</span>
                      {step.reverted && <span className="text-[9px] text-amber-400 no-underline font-bold">(لغو شد)</span>}
                    </div>
                    {step.comment && (
                      <p className="text-xs text-slate-400 mt-1 bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                        {step.comment}
                      </p>
                    )}
                    {step.amountCorrectionNote && (
                      <p className="text-xs text-amber-300 mt-1.5 bg-amber-950/40 p-2 rounded-lg border border-amber-500/30 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 shrink-0" />
                        <span>{step.amountCorrectionNote}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Revert / Undo Banner if user can rollback financial/workflow actions */}
          {(canUndoLastApproval || canUndoFinancialApproval || canUndoPayment || canUndoReturn) && (
            <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl text-xs space-y-3 shadow-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-amber-300 flex items-center gap-1.5 text-sm">
                  <RefreshCw className="w-4 h-4 text-amber-400" />
                  <span>قابلیت بازگشت از تایید / لغو آخرین اقدام</span>
                </span>
                <span className="text-[10px] bg-amber-500/20 text-amber-200 px-2.5 py-1 rounded-full font-bold border border-amber-500/30">
                  مدیریت بازگشت اقدامات
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11.5px]">
                در صورت بروز اشتباه، می‌توانید اقدام ثبت‌شده اخیر در این بخش را لغو و درخواست را به وضعیت قبلی یا کارتابل بررسی خود بازگردانید.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {canUndoLastApproval && (
                  <button
                    type="button"
                    onClick={handleUndoApproval}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white text-xs font-black rounded-xl shadow transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>بازگشت از ارجاع و تایید قبلی</span>
                  </button>
                )}
                {canUndoFinancialApproval && (
                  <button
                    type="button"
                    onClick={handleUndoFinancialApproval}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white text-xs font-black rounded-xl shadow transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>بازگشت از تایید مالی خزانه‌داری</span>
                  </button>
                )}
                {canUndoPayment && (
                  <button
                    type="button"
                    onClick={handleUndoPayment}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 text-white text-xs font-black rounded-xl shadow transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>بازگشت از تسویه و واریز (لغو واریز)</span>
                  </button>
                )}
                {canUndoReturn && (
                  <button
                    type="button"
                    onClick={handleUndoReturn}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white text-xs font-black rounded-xl shadow transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>بازگشت از عودت (لغو عودت)</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Actions Panel */}
          <div className="p-5 bg-slate-800/90 rounded-2xl border border-slate-700 space-y-4">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-indigo-400" />
              اقدام و تغییر وضعیت درخواست
            </h4>

            {isRequestorRole && !canResubmit ? (
              <div className="p-4 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-slate-400 text-center space-y-1">
                <p className="font-bold text-slate-300">اطلاعیه دسترسی نقش درخواست‌کننده:</p>
                <p>شما ثبت‌کننده این درخواست هستید. دکمه‌های تایید، ارجاع و واریز فقط برای تاییدکنندگان شعب و مسئولین خزانه‌داری نمایش داده می‌شود.</p>
              </div>
            ) : (
              <>
                {/* Comment Box */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">یادداشت / نظر شما</label>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={2}
                    placeholder="یادداشت برای مرحله بعدی..."
                    className="w-full bg-slate-900 text-white text-xs rounded-xl p-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  
                  {/* Forward Step */}
                  {canApproveAndForward && (
                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 flex flex-col justify-between">
                      <div>
                        <label className="block text-[10px] font-bold text-indigo-300 mb-1">
                          ۱. ارجاع به همکار/مجری بعدی
                        </label>
                        <select
                          value={selectedForwardUserId}
                          onChange={(e) => setSelectedForwardUserId(e.target.value)}
                          className="w-full bg-slate-800 text-white text-[10px] rounded-lg px-2 py-1.5 border border-slate-700"
                        >
                          {forwardTargetUsers.length === 0 && (
                            <option value="">هیچ مقصد مجازی تعریف نشده - با ادمین تماس بگیرید</option>
                          )}
                          {forwardTargetUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-amber-300 mb-1">
                          اصلاح مبلغ (اختیاری)
                        </label>
                        <input
                          type="number"
                          value={correctedAmount || ''}
                          onChange={(e) => setCorrectedAmount(Number(e.target.value))}
                          className="w-full bg-slate-800 text-emerald-300 font-mono font-bold text-[10px] rounded-lg px-2 py-1.5 border border-slate-700 focus:outline-none focus:border-amber-500"
                        />
                        {correctedAmount !== request.amount && (
                          <span className="text-[9px] text-amber-400 block mt-1 leading-tight">
                            {correctedAmount > 0
                              ? `مبلغ از ${formatRial(request.amount)} به ${formatRial(correctedAmount)} اصلاح خواهد شد.`
                              : 'مبلغ اصلاح‌شده باید بزرگ‌تر از صفر باشد.'}
                          </span>
                        )}
                        {hasBatchItems && (
                          <span className="text-[9px] text-slate-500 block mt-1 leading-tight">
                            این اصلاح فقط روی مبلغ کل درخواست اعمال می‌شود و وضعیت تایید/رد ردیف‌های جدول تجمیعی را تغییر نمی‌دهد.
                          </span>
                        )}
                      </div>

                      <button
                        onClick={handleApproveAndForward}
                        disabled={isSubmitting || (hasBatchItems && !allBatchItemsDecided)}
                        title={hasBatchItems && !allBatchItemsDecided ? 'ابتدا باید تکلیف تمام ردیف‌های جدول تجمیعی مشخص شود.' : undefined}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>تایید و ارجاع</span>
                      </button>
                      {hasBatchItems && !allBatchItemsDecided ? (
                        <span className="text-[9px] text-amber-400 font-bold block text-center">ابتدا ردیف‌های تجمیعی را تعیین تکلیف کنید</span>
                      ) : (
                        <span className="text-[9px] text-slate-400 block text-center">ارسال برای همکار یا مجری</span>
                      )}
                    </div>
                  )}

                  {/* Final Approve */}
                  {canFinalApproveTreasury && (
                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-blue-300 block">
                          ۲. تایید مالی خزانه‌داری
                        </span>
                        <p className="text-[9.5px] text-slate-400 mt-1 leading-tight">
                          صدور تاییدیه مالی و ارسال پرونده به مجری پرداخت
                        </p>
                      </div>
                      <button
                        onClick={handleFinalApproval}
                        disabled={isSubmitting}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-xs font-bold rounded-lg shadow transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>تایید نهایی خزانه‌داری</span>
                      </button>
                      <span className="text-[9px] text-slate-400 block text-center">تایید کامل جهت واریز</span>
                    </div>
                  )}

                  {/* Mark Paid */}
                  {canMarkPaid && (
                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-emerald-300 block">
                          ۳. تسویه و ثبت فیش
                        </span>
                        <p className="text-[9.5px] text-slate-400 mt-1 leading-tight">
                          تکمیل واریز بانکی و بایگانی فیش پایا / کارت به کارت
                        </p>
                      </div>
                      <button
                        onClick={handleMarkPaid}
                        disabled={isSubmitting}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-xs font-bold rounded-lg shadow transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>تایید واریز و ثبت فیش</span>
                      </button>
                      <span className="text-[9px] text-slate-400 block text-center">پرداخت شده و مختومه</span>
                    </div>
                  )}

                  {/* Return for Correction / Reject */}
                  {canReturnOrReject && (
                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-rose-300 block">
                          ۴. عودت یا رد درخواست
                        </span>
                        <p className="text-[9.5px] text-slate-400 mt-1 leading-tight">
                          برگشت به متقاضی جهت اصلاح فاکتور یا رد کامل
                        </p>
                      </div>
                      <button
                        onClick={() => setShowReturnInput(!showReturnInput)}
                        disabled={isSubmitting}
                        className="w-full py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 text-white text-xs font-bold rounded-lg shadow transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>عودت / رد درخواست</span>
                      </button>
                      <span className="text-[9px] text-slate-400 block text-center">دارای اشکال یا لغو</span>
                    </div>
                  )}

                </div>
              </>
            )}

            {/* Return / Reject Reason Input */}
            {showReturnInput && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl space-y-2 mt-2">
                <label className="block text-xs font-bold text-rose-300">
                  دلیل عودت یا رد درخواست (الزامی)
                </label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="علت ایراد، نیاز به فاکتور جدید، ناخوانا بودن مدارک..."
                  className="w-full bg-slate-900 text-white text-xs rounded-xl px-3 py-2 border border-slate-700"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={handleReturnForCorrection}
                    className="px-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-lg"
                  >
                    ثبت عودت جهت اصلاح
                  </button>
                  <button
                    onClick={handleRejectRequest}
                    className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg"
                  >
                    رد کامل درخواست
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
};
