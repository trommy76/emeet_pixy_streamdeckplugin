// Minimal DirectShow COM interop declarations -- just the handful of
// interfaces needed to enumerate video capture devices and drive their
// standard UVC camera/image controls. These are stable, publicly documented
// Microsoft interfaces (unchanged since Windows XP), hand-declared here so
// this project has zero external dependencies -- no DirectShowLib, no NuGet
// packages, nothing beyond the .NET SDK itself.
//
// Reference: the classic "PTZControl"/"DirectShowLib" samples widely used
// for webcam PTZ control on Windows use the exact same interfaces and GUIDs.
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace UvcUtilWin;

internal static class Guids
{
    public const string CLSID_SystemDeviceEnum = "62BE5D10-60EB-11d0-BD3B-00A0C911CE86";
    public const string CLSID_VideoInputDeviceCategory = "860BB310-5D01-11d0-BD3B-00A0C911CE86";
    public const string IID_ICreateDevEnum = "29840822-5B84-11D0-BD3B-00A0C911CE86";
    public const string IID_IBaseFilter = "56A86895-0AD4-11CE-B03A-0020AF0BA770";
    public const string IID_IAMCameraControl = "C6E13370-30AC-11d0-A18C-00A0C9118956";
    public const string IID_IAMVideoProcAmp = "C6E13360-30AC-11d0-A18C-00A0C9118956";
    public const string IID_IPropertyBag = "55272A00-42CB-11CE-8135-00AA004BB851";
}

[ComImport, Guid(Guids.IID_ICreateDevEnum), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface ICreateDevEnum
{
    [PreserveSig]
    int CreateClassEnumerator(ref Guid pType, out IEnumMoniker? ppEnumMoniker, int dwFlags);
}

[ComImport, Guid(Guids.IID_IPropertyBag), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPropertyBag
{
    [PreserveSig]
    int Read([MarshalAs(UnmanagedType.LPWStr)] string pszPropName, [MarshalAs(UnmanagedType.Struct)] ref object pVar, IntPtr pErrorLog);

    [PreserveSig]
    int Write([MarshalAs(UnmanagedType.LPWStr)] string pszPropName, [MarshalAs(UnmanagedType.Struct)] ref object pVar);
}

/// <summary>Camera Terminal controls -- pan, tilt, zoom, focus, exposure, iris.</summary>
[ComImport, Guid(Guids.IID_IAMCameraControl), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAMCameraControl
{
    [PreserveSig]
    int GetRange(CameraControlProperty property, out int pMin, out int pMax, out int pSteppingDelta, out int pDefault, out CameraControlFlags pCapsFlags);

    [PreserveSig]
    int Set(CameraControlProperty property, int lValue, CameraControlFlags flags);

    [PreserveSig]
    int Get(CameraControlProperty property, out int lValue, out CameraControlFlags pFlags);
}

/// <summary>Processing Unit controls -- brightness, contrast, white balance, etc.</summary>
[ComImport, Guid(Guids.IID_IAMVideoProcAmp), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAMVideoProcAmp
{
    [PreserveSig]
    int GetRange(VideoProcAmpProperty property, out int pMin, out int pMax, out int pSteppingDelta, out int pDefault, out VideoProcAmpFlags pCapsFlags);

    [PreserveSig]
    int Set(VideoProcAmpProperty property, int lValue, VideoProcAmpFlags flags);

    [PreserveSig]
    int Get(VideoProcAmpProperty property, out int lValue, out VideoProcAmpFlags pFlags);
}

internal enum CameraControlProperty
{
    Pan = 0,
    Tilt = 1,
    Roll = 2,
    Zoom = 3,
    Exposure = 4,
    Iris = 5,
    Focus = 6,
}

[Flags]
internal enum CameraControlFlags
{
    Auto = 0x0001,
    Manual = 0x0002,
}

internal enum VideoProcAmpProperty
{
    Brightness = 0,
    Contrast = 1,
    Hue = 2,
    Saturation = 3,
    Sharpness = 4,
    Gamma = 5,
    ColorEnable = 6,
    WhiteBalance = 7,
    BacklightCompensation = 8,
    Gain = 9,
}

[Flags]
internal enum VideoProcAmpFlags
{
    Auto = 0x0001,
    Manual = 0x0002,
}

/// <summary>
/// One enumerated video capture device: its friendly name, its DirectShow
/// filter (bound lazily), and its USB vendor:product id parsed out of the
/// device path (when it's a USB device -- not all cameras are).
/// </summary>
internal sealed class CaptureDevice
{
    public required string FriendlyName { get; init; }
    public required string DevicePath { get; init; }
    public string? VendorId { get; init; }
    public string? ProductId { get; init; }
    public required IMoniker Moniker { get; init; }

    public bool MatchesTarget(string vendorId, string productId) =>
        string.Equals(VendorId, vendorId, StringComparison.OrdinalIgnoreCase) && string.Equals(ProductId, productId, StringComparison.OrdinalIgnoreCase);
}

internal static class DeviceEnumerator
{
    public static System.Collections.Generic.List<CaptureDevice> EnumerateVideoInputDevices()
    {
        var result = new System.Collections.Generic.List<CaptureDevice>();

        var systemDeviceEnumType = Type.GetTypeFromCLSID(new Guid(Guids.CLSID_SystemDeviceEnum))
            ?? throw new InvalidOperationException("Could not find the DirectShow system device enumerator (CLSID_SystemDeviceEnum). Is this really Windows?");
        var systemDeviceEnum = (ICreateDevEnum)(Activator.CreateInstance(systemDeviceEnumType)
            ?? throw new InvalidOperationException("Could not create the DirectShow system device enumerator."));

        var videoInputCategory = new Guid(Guids.CLSID_VideoInputDeviceCategory);
        int hr = systemDeviceEnum.CreateClassEnumerator(ref videoInputCategory, out var enumMoniker, 0);
        if (hr != 0 || enumMoniker is null)
        {
            // Not an error -- CreateClassEnumerator returns S_FALSE with a null
            // enumerator when there are simply no video capture devices at all.
            return result;
        }

        var monikers = new IMoniker[1];
        while (enumMoniker.Next(1, monikers, IntPtr.Zero) == 0)
        {
            var moniker = monikers[0];
            string friendlyName = "(unknown)";
            string devicePath = "";
            try
            {
                var bagGuid = new Guid(Guids.IID_IPropertyBag);
                moniker.BindToStorage(null!, null!, ref bagGuid, out var bagObj);
                if (bagObj is IPropertyBag bag)
                {
                    object nameVal = "";
                    if (bag.Read("FriendlyName", ref nameVal, IntPtr.Zero) == 0 && nameVal is string nameStr)
                        friendlyName = nameStr;

                    object pathVal = "";
                    if (bag.Read("DevicePath", ref pathVal, IntPtr.Zero) == 0 && pathVal is string pathStr)
                        devicePath = pathStr;
                }
            }
            catch
            {
                // Some virtual/software "cameras" don't expose a property bag cleanly -- skip enrichment, keep the moniker.
            }

            var (vendorId, productId) = ParseVidPid(devicePath);
            result.Add(new CaptureDevice
            {
                FriendlyName = friendlyName,
                DevicePath = devicePath,
                VendorId = vendorId,
                ProductId = productId,
                Moniker = moniker,
            });
        }

        return result;
    }

    private static (string? vendorId, string? productId) ParseVidPid(string devicePath)
    {
        // USB DirectShow device paths look like:
        //   \\?\usb#vid_328f&pid_00c0&mi_00#6&....
        var match = System.Text.RegularExpressions.Regex.Match(devicePath, @"vid_([0-9a-fA-F]{4}).*?pid_([0-9a-fA-F]{4})");
        return match.Success ? (match.Groups[1].Value, match.Groups[2].Value) : (null, null);
    }

    public static object BindToFilter(IMoniker moniker)
    {
        var baseFilterGuid = new Guid(Guids.IID_IBaseFilter);
        moniker.BindToObject(null!, null!, ref baseFilterGuid, out var obj);
        return obj;
    }
}
