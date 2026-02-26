import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Search, QrCode, Loader2, Package, User, Phone, MapPin, Calendar,
  CheckCircle, Clock, Truck, XCircle, UserCheck, Trash2, CreditCard,
  Banknote, FileText, Wallet, AlertCircle, Flashlight, FlashlightOff,
  ZoomIn, ZoomOut, SwitchCamera, ImagePlus, Gift
} from 'lucide-react';
import jsQR from 'jsqr';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { OrderWithDetails, OrderStatus } from '@/types/database';
import { useUpdateOrderStatus, useDeleteOrder } from '@/hooks/useOrders';
import { useLogActivity } from '@/hooks/useActivityLogs';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OrderSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'قيد الانتظار', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  assigned: { label: 'تم التعيين', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: UserCheck },
  in_progress: { label: 'قيد التوصيل', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: Truck },
  delivered: { label: 'تم التوصيل', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
  cancelled: { label: 'ملغي', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

const PAYMENT_STATUS_CONFIG = {
  pending: { label: 'قيد الانتظار', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  cash: { label: 'كاش', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: Banknote },
  check: { label: 'Chèque', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: FileText },
  credit: { label: 'بالدين', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: CreditCard },
  partial: { label: 'دفع جزئي', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: Wallet },
};

type PaymentStatus = keyof typeof PAYMENT_STATUS_CONFIG;

const INACTIVITY_TIMEOUT = 30000; // 30 seconds

const OrderSearchDialog: React.FC<OrderSearchDialogProps> = ({ open, onOpenChange }) => {
  const [searchCode, setSearchCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [order, setOrder] = useState<OrderWithDetails | null>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem('qr_scanner_zoom');
    return saved ? parseFloat(saved) : 1;
  });
  const [zoomSupported, setZoomSupported] = useState(false);
  const [maxZoom, setMaxZoom] = useState(1);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [useFallbackScanner, setUseFallbackScanner] = useState(false);
  const [continuousScanMode, setContinuousScanMode] = useState(false);
  const [scannedOrders, setScannedOrders] = useState<OrderWithDetails[]>([]);
  const [inactivityTimer, setInactivityTimer] = useState<number>(30);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scanningRef = useRef<boolean>(false);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const updateStatus = useUpdateOrderStatus();
  const deleteOrder = useDeleteOrder();
  const logActivity = useLogActivity();
  
  // Reset inactivity timer on user activity
  const resetInactivityTimer = () => {
    // Clear existing timers
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    
    setInactivityTimer(30);
    
    // Start countdown
    countdownIntervalRef.current = setInterval(() => {
      setInactivityTimer(prev => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // Set new timeout
    inactivityTimeoutRef.current = setTimeout(() => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      toast.info('تم إغلاق النافذة تلقائياً بسبب عدم النشاط');
      onOpenChange(false);
    }, INACTIVITY_TIMEOUT);
  };
  
  // Start inactivity timer when dialog opens
  useEffect(() => {
    if (open) {
      resetInactivityTimer();
    } else {
      // Cleanup timers when dialog closes
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    }
    
    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [open]);
  
  // Reset timer on user interactions
  const handleUserActivity = () => {
    if (open) {
      resetInactivityTimer();
    }
  };

  // Vibrate phone on success
  const vibratePhone = () => {
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]); // Two short vibrations
      }
    } catch (e) {
      console.log('Vibration not supported');
    }
  };

  // Play success beep sound
  const playSuccessBeep = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 1200;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.log('Audio not supported');
    }
  };

  // Apply zoom to camera and save to localStorage
  const applyZoom = async (newZoom: number) => {
    if (!streamRef.current) return;
    
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    
    try {
      await track.applyConstraints({
        advanced: [{ zoom: newZoom } as any]
      });
      setZoomLevel(newZoom);
      localStorage.setItem('qr_scanner_zoom', newZoom.toString());
    } catch (e) {
      console.log('Zoom apply failed:', e);
    }
  };

  // Switch between front and back camera
  const switchCamera = async () => {
    const newFacingMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacingMode);
    
    // Stop current stream and restart with new facing mode
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Restart scanning with new camera
    await startScanningWithFacingMode(newFacingMode);
  };
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    
    try {
      const capabilities = track.getCapabilities() as any;
      if (capabilities.torch) {
        await track.applyConstraints({
          advanced: [{ torch: !torchOn } as any]
        });
        setTorchOn(!torchOn);
      }
    } catch (e) {
      console.log('Torch toggle failed:', e);
    }
  };

  // Cleanup camera on unmount or dialog close
  useEffect(() => {
    if (!open) {
      stopScanning();
      setOrder(null);
      setSearchCode('');
      setOrderItems([]);
      setContinuousScanMode(false);
      setScannedOrders([]);
    }
  }, [open]);

  const stopScanning = () => {
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
    setTorchOn(false);
    setTorchSupported(false);
    setZoomSupported(false);
    setMaxZoom(1);
    setUseFallbackScanner(false);
  };

  // Handle successful scan
  const handleScanSuccess = async (code: string) => {
    playSuccessBeep();
    vibratePhone();
    handleUserActivity();
    
    if (!continuousScanMode) {
      stopScanning();
    }
    
    setSearchCode(code);
    await searchOrder(code, continuousScanMode);
    
    // In continuous mode, continue scanning after a brief pause
    if (continuousScanMode && scanningRef.current) {
      setTimeout(() => {
        // Reset scanning loop
        scanningRef.current = true;
      }, 1000);
    }
  };

  // Handle image upload for QR scanning
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const image = new Image();
      image.src = URL.createObjectURL(file);
      
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });

      // Try scanning at multiple scales for better accuracy
      const scales = [1, 1.5, 2, 0.75, 0.5];
      let foundCode: string | null = null;

      for (const scale of scales) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        const width = Math.floor(image.width * scale);
        const height = Math.floor(image.height * scale);
        
        canvas.width = width;
        canvas.height = height;
        
        // Use better image smoothing for upscaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        if (code && code.data) {
          console.log(`QR found at scale ${scale}:`, code.data);
          foundCode = code.data;
          break;
        }
      }

      URL.revokeObjectURL(image.src);

      if (foundCode) {
        console.log('Final QR code value:', foundCode);
        playSuccessBeep();
        vibratePhone();
        setSearchCode(foundCode);
        await searchOrder(foundCode);
      } else {
        toast.error('لم يتم العثور على رمز QR في الصورة. حاول التقاط صورة أوضح');
      }
    } catch (error) {
      console.error('Image processing error:', error);
      toast.error('فشل في قراءة الصورة');
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startScanning = async () => {
    await startScanningWithFacingMode(facingMode);
  };

  const startScanningWithFacingMode = async (mode: 'environment' | 'user') => {
    try {
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Request camera with mobile-friendly settings
      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode: { exact: mode },
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 }
        },
        audio: false
      };
      
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (exactError) {
        // Fallback to ideal if exact fails
        const fallbackConstraints: MediaStreamConstraints = {
          video: { 
            facingMode: { ideal: mode },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 }
          },
          audio: false
        };
        stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      }
      
      streamRef.current = stream;
      setIsScanning(true);
      
      // Check torch and zoom support
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = track.getCapabilities() as any;
          if (capabilities.torch) {
            setTorchSupported(true);
          }
          if (capabilities.zoom) {
            setZoomSupported(true);
            const minZoom = capabilities.zoom.min || 1;
            const maxZoomValue = capabilities.zoom.max || 4;
            setMaxZoom(maxZoomValue);
            
            // Restore saved zoom level if within bounds
            const savedZoom = localStorage.getItem('qr_scanner_zoom');
            const initialZoom = savedZoom ? Math.min(Math.max(parseFloat(savedZoom), minZoom), maxZoomValue) : minZoom;
            setZoomLevel(initialZoom);
            
            // Apply saved zoom
            if (initialZoom > minZoom) {
              await track.applyConstraints({
                advanced: [{ zoom: initialZoom } as any]
              });
            }
          }
        } catch (e) {
          // Torch/Zoom not supported
        }
      }
      
      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        
        // Wait for video to be ready before starting detection
        await new Promise<void>((resolve) => {
          if (!videoRef.current) {
            resolve();
            return;
          }
          
          const checkReady = () => {
            if (videoRef.current && videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
              resolve();
            } else {
              requestAnimationFrame(checkReady);
            }
          };
          
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().then(() => {
              checkReady();
            }).catch((err) => {
              console.error('Video play failed:', err);
              resolve();
            });
          };
          
          // If already loaded, trigger immediately
          if (videoRef.current.readyState >= 2) {
            videoRef.current.play().then(() => {
              checkReady();
            }).catch(console.error);
          }
        });
        
        // Start barcode detection
        const hasBarcodeDetector = 'BarcodeDetector' in window;
        setUseFallbackScanner(!hasBarcodeDetector);
        scanningRef.current = true;
        
        if (hasBarcodeDetector) {
          const barcodeDetector = new (window as any).BarcodeDetector({ 
            formats: ['qr_code', 'code_128', 'ean_13', 'ean_8'] 
          });
          
          const detectCode = async () => {
            if (!videoRef.current || !streamRef.current || !scanningRef.current) return;
            
            if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
              requestAnimationFrame(detectCode);
              return;
            }
            
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const code = barcodes[0].rawValue;
                handleScanSuccess(code);
                return;
              }
            } catch (err) {
              // Continue scanning
            }
            
            if (streamRef.current && scanningRef.current) {
              requestAnimationFrame(detectCode);
            }
          };
          
          requestAnimationFrame(detectCode);
        } else {
          // Use jsQR fallback
          const detectWithJsQR = () => {
            if (!videoRef.current || !canvasRef.current || !streamRef.current || !scanningRef.current) return;
            
            if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
              requestAnimationFrame(detectWithJsQR);
              return;
            }
            
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              requestAnimationFrame(detectWithJsQR);
              return;
            }
            
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
              handleScanSuccess(code.data);
              return;
            }
            
            if (streamRef.current && scanningRef.current) {
              requestAnimationFrame(detectWithJsQR);
            }
          };
          
          requestAnimationFrame(detectWithJsQR);
        }
      }
      
    } catch (error: any) {
      console.error('Camera error:', error);
      setIsScanning(false);
      
      if (error.name === 'NotAllowedError') {
        toast.error('تم رفض إذن الكاميرا. الرجاء السماح بالوصول للكاميرا من إعدادات المتصفح');
      } else if (error.name === 'NotFoundError') {
        toast.error('لم يتم العثور على كاميرا');
      } else if (error.name === 'NotReadableError') {
        toast.error('الكاميرا قيد الاستخدام من تطبيق آخر');
      } else if (error.name === 'OverconstrainedError') {
        // Retry with simpler constraints
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: false 
          });
          streamRef.current = fallbackStream;
          setIsScanning(true);
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            await videoRef.current.play();
          }
        } catch (e) {
          toast.error('لا يمكن الوصول للكاميرا');
        }
      } else {
        toast.error('لا يمكن الوصول للكاميرا: ' + error.message);
      }
    }
  };

  const searchOrder = async (code: string, isContinuousMode: boolean = false) => {
    if (!code.trim()) {
      toast.error('الرجاء إدخال كود الطلبية');
      return;
    }
    
    setIsSearching(true);
    try {
      // Use RPC function to search by UUID prefix (handles case conversion internally)
      const { data: orderIds, error: rpcError } = await supabase
        .rpc('search_orders_by_prefix', { p_prefix: code.trim(), p_limit: 1 });
      
      if (rpcError) throw rpcError;
      
      if (!orderIds || orderIds.length === 0) {
        toast.error('لم يتم العثور على طلبية بهذا الكود');
        if (!isContinuousMode) {
          setOrder(null);
        }
        return;
      }
      
      // Check if already scanned in continuous mode
      if (isContinuousMode) {
        const alreadyScanned = scannedOrders.some(o => o.id === orderIds[0].order_id);
        if (alreadyScanned) {
          toast.info('تم مسح هذه الطلبية مسبقاً');
          return;
        }
      }
      
      // Fetch full order details using the found ID
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*),
          created_by_worker:workers!orders_created_by_fkey(id, full_name, username),
          assigned_worker:workers!orders_assigned_worker_id_fkey(id, full_name, username)
        `)
        .eq('id', orderIds[0].order_id);
      
      if (error) throw error;
      
      if (!orders || orders.length === 0) {
        toast.error('لم يتم العثور على طلبية بهذا الكود');
        if (!isContinuousMode) {
          setOrder(null);
        }
        return;
      }
      
      const foundOrder = orders[0] as OrderWithDetails;
      
      // Fetch order items
      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select(`*, product:products(*)`)
        .eq('order_id', foundOrder.id);
      
      // Enrich items with gift unit from offer tiers
      let enrichedItems = items || [];
      if (!itemsError && items) {
        const giftOfferIds = [...new Set(items.map(i => i.gift_offer_id).filter(Boolean))] as string[];
        if (giftOfferIds.length > 0) {
          const { data: tiers } = await supabase
            .from('product_offer_tiers')
            .select('offer_id, gift_quantity_unit')
            .in('offer_id', giftOfferIds);
          const unitMap: Record<string, string> = {};
          for (const t of (tiers || [])) {
            unitMap[t.offer_id] = t.gift_quantity_unit || 'piece';
          }
          enrichedItems = items.map(i => ({
            ...i,
            gift_unit: i.gift_offer_id ? (unitMap[i.gift_offer_id] || 'piece') : 'piece',
          }));
        }
      }
      
      if (isContinuousMode) {
        // Add to scanned orders list
        setScannedOrders(prev => [...prev, foundOrder]);
        toast.success(`تم إضافة طلبية ${foundOrder.customer?.store_name || foundOrder.customer?.name || 'غير معروف'}`);
      } else {
        setOrder(foundOrder);
        setOrderItems(enrichedItems);
        // Close scanner automatically after finding order
        stopScanning();
        toast.success('تم العثور على الطلبية');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleUpdateStatus = async (status: OrderStatus) => {
    if (!order) return;
    try {
      await updateStatus.mutateAsync({ orderId: order.id, status });
      await logActivity.mutateAsync({
        actionType: 'status_change',
        entityType: 'order',
        entityId: order.id,
        details: { الحالة_الجديدة: STATUS_CONFIG[status].label },
      });
      setOrder({ ...order, status });
      toast.success('تم تحديث حالة الطلبية');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdatePaymentStatus = async (paymentStatus: PaymentStatus, partialAmount?: number) => {
    if (!order) return;
    try {
      const updateData: any = { payment_status: paymentStatus };
      if (paymentStatus === 'partial' && partialAmount) {
        updateData.partial_amount = partialAmount;
      }
      
      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', order.id);
      
      if (error) throw error;
      
      await logActivity.mutateAsync({
        actionType: 'payment_update',
        entityType: 'order',
        entityId: order.id,
        details: { حالة_الدفع: PAYMENT_STATUS_CONFIG[paymentStatus].label },
      });
      
      setOrder({ ...order, payment_status: paymentStatus, partial_amount: partialAmount } as any);
      toast.success('تم تحديث حالة الدفع');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async () => {
    if (!order) return;
    try {
      await deleteOrder.mutateAsync(order.id);
      await logActivity.mutateAsync({
        actionType: 'delete',
        entityType: 'order',
        entityId: order.id,
        details: { العميل: order.customer?.name },
      });
      toast.success('تم حذف الطلبية');
      setOrder(null);
      setShowDeleteConfirm(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const StatusIcon = order ? STATUS_CONFIG[order.status]?.icon || Clock : Clock;
  const paymentStatus = (order as any)?.payment_status || 'pending';
  const PaymentIcon = PAYMENT_STATUS_CONFIG[paymentStatus as PaymentStatus]?.icon || Clock;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className="max-w-lg max-h-[90vh] overflow-y-auto" 
          dir="rtl"
          onClick={handleUserActivity}
          onKeyDown={handleUserActivity}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                البحث عن طلبية
              </span>
              <Badge variant="outline" className="text-xs">
                <Clock className="w-3 h-3 ml-1" />
                {inactivityTimer}ث
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Continuous Scan Mode Toggle */}
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">وضع المسح المتتالي</span>
              <Button
                variant={continuousScanMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  handleUserActivity();
                  setContinuousScanMode(!continuousScanMode);
                  if (!continuousScanMode) {
                    setScannedOrders([]);
                    setOrder(null);
                  }
                }}
              >
                {continuousScanMode ? 'مُفعّل' : 'مُعطّل'}
              </Button>
            </div>
            
            {/* Scanned Orders Count in Continuous Mode */}
            {continuousScanMode && scannedOrders.length > 0 && (
              <div className="p-3 bg-primary/10 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium">الطلبيات الممسوحة:</span>
                  <Badge>{scannedOrders.length}</Badge>
                </div>
                <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                  {scannedOrders.map((o, i) => (
                    <div key={o.id} className="flex items-center justify-between text-sm bg-background/50 p-2 rounded">
                      <span>{i + 1}. {o.customer?.store_name || o.customer?.name}</span>
                      <span className="text-muted-foreground font-mono">{o.id.substring(0, 8).toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Search Input */}
            <div className="flex gap-2">
              <Input
                placeholder="كود الطلبية، اسم العميل، أو رقم الهاتف..."
                value={searchCode}
                onChange={(e) => {
                  handleUserActivity();
                  setSearchCode(e.target.value);
                }}
                onKeyDown={(e) => {
                  handleUserActivity();
                  if (e.key === 'Enter') searchOrder(searchCode);
                }}
                className="flex-1"
              />
              <Button onClick={() => { handleUserActivity(); searchOrder(searchCode); }} disabled={isSearching}>
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
              <Button variant="outline" onClick={() => { handleUserActivity(); isScanning ? stopScanning() : startScanning(); }}>
                <QrCode className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={() => { handleUserActivity(); fileInputRef.current?.click(); }}>
                <ImagePlus className="w-4 h-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { handleUserActivity(); handleImageUpload(e); }}
              />
            </div>
            
            {/* Hidden canvas for jsQR processing */}
            <canvas ref={canvasRef} className="hidden" />
            
            {/* QR Scanner */}
            {isScanning && (
              <div className="relative rounded-lg overflow-hidden bg-black">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline
                  muted
                  className="w-full aspect-square object-cover"
                  style={{ transform: 'scaleX(1)' }}
                />
                <div className="absolute inset-0 border-4 border-primary/50 rounded-lg pointer-events-none">
                  {/* Scanning corners */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
                </div>
                
                {/* Control buttons container */}
                <div className="absolute top-2 right-2 flex flex-col gap-2">
                  {/* Switch camera button */}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="bg-background/50 hover:bg-background/70"
                    onClick={switchCamera}
                  >
                    <SwitchCamera className="w-5 h-5" />
                  </Button>
                  
                  {/* Torch button */}
                  {torchSupported && (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="bg-background/50 hover:bg-background/70"
                      onClick={toggleTorch}
                    >
                      {torchOn ? (
                        <Flashlight className="w-5 h-5 text-primary" />
                      ) : (
                        <FlashlightOff className="w-5 h-5 text-muted-foreground" />
                      )}
                    </Button>
                  )}
                </div>
                
                {/* Zoom controls */}
                {zoomSupported && (
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="bg-background/50 hover:bg-background/70"
                      onClick={() => applyZoom(Math.min(zoomLevel + 0.5, maxZoom))}
                      disabled={zoomLevel >= maxZoom}
                    >
                      <ZoomIn className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="bg-background/50 hover:bg-background/70 text-xs px-1"
                      onClick={() => {
                        applyZoom(1);
                        localStorage.removeItem('qr_scanner_zoom');
                      }}
                      disabled={zoomLevel === 1}
                    >
                      {zoomLevel.toFixed(1)}x
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="bg-background/50 hover:bg-background/70"
                      onClick={() => applyZoom(Math.max(zoomLevel - 0.5, 1))}
                      disabled={zoomLevel <= 1}
                    >
                      <ZoomOut className="w-5 h-5" />
                    </Button>
                  </div>
                )}
                
                {/* Camera info and instructions */}
                <div className="absolute bottom-2 left-0 right-0 text-center bg-background/50 py-1.5 px-2">
                  <p className="text-foreground text-sm">وجّه الكاميرا نحو رمز QR</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {facingMode === 'environment' ? '📷 الكاميرا الخلفية' : '🤳 الكاميرا الأمامية'}
                  </p>
                </div>
              </div>
            )}
            
            {/* Order Details - Hide in continuous mode */}
            {order && !continuousScanMode && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  {/* Order Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">كود الطلبية</p>
                      <p className="font-mono font-bold">{order.id.substring(0, 8).toUpperCase()}</p>
                    </div>
                    <Badge className={STATUS_CONFIG[order.status]?.color}>
                      <StatusIcon className="w-3 h-3 ml-1" />
                      {STATUS_CONFIG[order.status]?.label}
                    </Badge>
                  </div>
                  
                  <Separator />
                  
                  {/* Customer Info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-bold">{order.customer?.name}</span>
                    </div>
                    {order.customer?.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <a href={`tel:${order.customer.phone}`} className="text-primary">
                          {order.customer.phone}
                        </a>
                      </div>
                    )}
                    {order.customer?.address && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        <span>{order.customer.address}</span>
                      </div>
                    )}
                  </div>
                  
                  <Separator />
                  
                  {/* Products */}
                  <div className="space-y-2">
                    <p className="font-bold flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      المنتجات
                    </p>
                    {orderItems.map((item) => (
                      <div key={item.id} className="p-2 bg-muted/50 rounded">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">
                            {item.product?.name}
                            {item.gift_quantity > 0 && (
                              <Badge variant="outline" className="ms-1 text-[10px] px-1 py-0 border-green-500 text-green-600">
                                <Gift className="w-3 h-3 ms-0.5" />
                                {item.gift_quantity} {item.gift_unit === 'box' ? 'صندوق' : item.gift_unit === 'kg' ? 'كغ' : 'قطعة'} مجاناً
                              </Badge>
                            )}
                          </span>
                          <Badge variant="secondary">{item.quantity} صندوق</Badge>
                        </div>
                        {(item.unit_price || 0) > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {Number(item.unit_price).toLocaleString()} دج × {item.quantity - (item.gift_quantity || 0)} = {Number(item.total_price || 0).toLocaleString()} دج
                          </p>
                        )}
                      </div>
                    ))}
                    {order?.total_amount && Number(order.total_amount) > 0 && (
                      <div className="flex items-center justify-between p-2 bg-primary/10 rounded font-bold">
                        <span>الإجمالي</span>
                        <span className="text-primary">{Number(order.total_amount).toLocaleString()} دج</span>
                      </div>
                    )}
                  </div>
                  
                  <Separator />
                  
                  {/* Payment Status */}
                  <div className="space-y-2">
                    <p className="font-bold flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      حالة الدفع
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge className={PAYMENT_STATUS_CONFIG[paymentStatus as PaymentStatus]?.color}>
                        <PaymentIcon className="w-3 h-3 ml-1" />
                        {PAYMENT_STATUS_CONFIG[paymentStatus as PaymentStatus]?.label}
                      </Badge>
                      {paymentStatus === 'partial' && (order as any).partial_amount && (
                        <span className="text-sm text-muted-foreground">
                          ({(order as any).partial_amount} دج)
                        </span>
                      )}
                    </div>
                    <Select
                      value={paymentStatus}
                      onValueChange={(val) => handleUpdatePaymentStatus(val as PaymentStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="تغيير حالة الدفع" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">قيد الانتظار</SelectItem>
                        <SelectItem value="cash">كاش</SelectItem>
                        <SelectItem value="check">Chèque</SelectItem>
                        <SelectItem value="credit">بالدين</SelectItem>
                        <SelectItem value="partial">دفع جزئي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Separator />
                  
                  {/* Order Status Actions */}
                  <div className="space-y-2">
                    <p className="font-bold">تحديث حالة الطلبية</p>
                    <Select
                      value={order.status}
                      onValueChange={(val) => handleUpdateStatus(val as OrderStatus)}
                      disabled={updateStatus.isPending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">قيد الانتظار</SelectItem>
                        <SelectItem value="assigned">تم التعيين</SelectItem>
                        <SelectItem value="in_progress">قيد التوصيل</SelectItem>
                        <SelectItem value="delivered">تم التوصيل</SelectItem>
                        <SelectItem value="cancelled">ملغي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Meta Info */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      تاريخ الإنشاء: {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: ar })}
                    </p>
                    {order.delivery_date && (
                      <p>تاريخ التوصيل: {format(new Date(order.delivery_date), 'dd MMMM yyyy', { locale: ar })}</p>
                    )}
                    <p>بواسطة: {order.created_by_worker?.full_name}</p>
                    {order.assigned_worker && (
                      <p>عامل التوصيل: {order.assigned_worker.full_name}</p>
                    )}
                  </div>
                  
                  {/* Delete Button */}
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="w-4 h-4 ml-2" />
                    حذف الطلبية
                  </Button>
                </CardContent>
              </Card>
            )}
            
            {!order && !isSearching && !isScanning && (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="mb-2">ابحث بـ:</p>
                <p className="text-sm">كود الطلبية • اسم العميل • رقم الهاتف</p>
                <p className="text-xs mt-2">أو امسح رمز QR</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              تأكيد الحذف
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذه الطلبية؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default OrderSearchDialog;
