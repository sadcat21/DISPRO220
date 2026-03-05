package com.laserfood.app;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.telephony.SmsManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.List;

@CapacitorPlugin(
        name = "SafeSmsSender",
        permissions = {
                @Permission(alias = "send_sms", strings = {Manifest.permission.SEND_SMS}),
                @Permission(alias = "read_phone_state", strings = {Manifest.permission.READ_PHONE_STATE})
        }
)
public class SafeSmsSenderPlugin extends Plugin {

    private String smsSentAction;
    private String smsDeliveredAction;
    private BroadcastReceiver sendReceiver;
    private BroadcastReceiver deliveredReceiver;

    @Override
    public void load() {
        smsSentAction = getContext().getPackageName() + ".SMS_SENT";
        smsDeliveredAction = getContext().getPackageName() + ".SMS_DELIVERED";

        sendReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                JSObject ret = new JSObject();
                ret.put("id", intent.getIntExtra("id", -1));
                ret.put("res_status", getResultCode());
                ret.put("status", getResultCode() == Activity.RESULT_OK ? "SENT" : "FAILED");
                notifyListeners("smsSenderStatusUpdated", ret);
            }
        };

        deliveredReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                JSObject ret = new JSObject();
                ret.put("id", intent.getIntExtra("id", -1));
                ret.put("res_status", getResultCode());
                ret.put("status", getResultCode() == Activity.RESULT_OK ? "DELIVERED" : "FAILED");
                notifyListeners("smsSenderStatusUpdated", ret);
            }
        };

        registerReceiverSafely(sendReceiver, new IntentFilter(smsSentAction));
        registerReceiverSafely(deliveredReceiver, new IntentFilter(smsDeliveredAction));
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        unregisterReceiverSafely(sendReceiver);
        unregisterReceiverSafely(deliveredReceiver);
    }

    private void registerReceiverSafely(BroadcastReceiver receiver, IntentFilter filter) {
        if (receiver == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }
    }

    private void unregisterReceiverSafely(BroadcastReceiver receiver) {
        if (receiver == null) return;
        try {
            getContext().unregisterReceiver(receiver);
        } catch (IllegalArgumentException ignored) {
            // already unregistered
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        if (!hasRequiredPermissions()) {
            call.reject("Requested permission is not granted");
            return;
        }

        Integer idBoxed = call.getInt("id");
        String text = call.getString("text", "").trim();
        String phone = call.getString("phone", "").trim();
        int simSlot = call.getInt("sim", 0);

        if (idBoxed == null) {
            call.reject("SMS id is required");
            return;
        }

        if (phone.isEmpty() || text.isEmpty()) {
            call.reject("phone and text are required");
            return;
        }

        final int id = idBoxed;

        try {
            SmsManager manager = getSmsManagerForSlot(simSlot);
            if (manager == null) {
                call.reject("Could not get SmsManager instance");
                return;
            }

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            Intent sentIntent = new Intent(smsSentAction).setPackage(getContext().getPackageName());
            sentIntent.putExtra("id", id);
            PendingIntent sentPI = PendingIntent.getBroadcast(getContext(), id, sentIntent, flags);

            Intent deliveredIntent = new Intent(smsDeliveredAction).setPackage(getContext().getPackageName());
            deliveredIntent.putExtra("id", id);
            PendingIntent deliveredPI = PendingIntent.getBroadcast(getContext(), id + 100000, deliveredIntent, flags);

            manager.sendTextMessage(phone, null, text, sentPI, deliveredPI);

            JSObject ret = new JSObject();
            ret.put("id", id);
            ret.put("status", "PENDING");
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("sendTextMessage failed: " + t.getClass().getSimpleName() + " - " + t.getMessage());
        }
    }

    @Nullable
    private SmsManager getSmsManagerForSlot(int simSlot) {
        final Context context = getContext();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                SubscriptionManager subManager = context.getSystemService(SubscriptionManager.class);
                if (subManager != null) {
                    List<SubscriptionInfo> subs = subManager.getActiveSubscriptionInfoList();
                    if (subs != null && !subs.isEmpty()) {
                        SubscriptionInfo selected = null;

                        for (SubscriptionInfo info : subs) {
                            if (info != null && info.getSimSlotIndex() == simSlot) {
                                selected = info;
                                break;
                            }
                        }

                        if (selected == null && simSlot >= 0 && simSlot < subs.size()) {
                            selected = subs.get(simSlot);
                        }

                        if (selected == null) {
                            selected = subs.get(0);
                        }

                        int subId = selected.getSubscriptionId();
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            SmsManager systemSms = context.getSystemService(SmsManager.class);
                            if (systemSms != null) {
                                return systemSms.createForSubscriptionId(subId);
                            }
                        }
                        return SmsManager.getSmsManagerForSubscriptionId(subId);
                    }
                }
            }
        } catch (Throwable ignored) {
            // fallback below
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            SmsManager systemSms = context.getSystemService(SmsManager.class);
            if (systemSms != null) return systemSms;
        }

        return SmsManager.getDefault();
    }
}
