// ============================================================================
// MAP2 Audio Platform - Network Configuration Panel
// Comprehensive network management for Fedora-based systems
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Divider,
  CircularProgress,
  Alert,
  IconButton,
  Button,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Tab,
  Tabs,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as OkIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Lan as EthernetIcon,
  Wifi as WifiIcon,
  WifiOff as WifiOffIcon,
  Router as RouterIcon,
  Public as PublicIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  SignalWifi4Bar as Signal4Icon,
  SignalWifi3Bar as Signal3Icon,
  SignalWifi2Bar as Signal2Icon,
  SignalWifi1Bar as Signal1Icon,
  SignalWifi0Bar as Signal0Icon,
  NetworkCheck as NetworkCheckIcon,
  Settings as SettingsIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  ExpandMore as ExpandIcon,
  Dns as DnsIcon,
  Speed as SpeedIcon,
  Link as LinkIcon,
  LinkOff as LinkOffIcon,
  Cloud as CloudIcon,
  CloudOff as CloudOffIcon,
  VpnKey as VpnIcon,
  Security as SecurityIcon,
  WifiFind as ScanIcon,
  Shield as FirewallIcon,
} from '@mui/icons-material';
import { networkApi } from '../api';
import type {
  NetworkStatus,
  EthernetInterface,
  WiFiInterface,
  WiFiNetwork,
  IPConfiguration,
  DNSConfiguration,
  NetworkService,
  FirewallZone,
} from '../types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}

function getSignalIcon(strength: number) {
  if (strength >= 80) return <Signal4Icon color="success" />;
  if (strength >= 60) return <Signal3Icon color="success" />;
  if (strength >= 40) return <Signal2Icon color="warning" />;
  if (strength >= 20) return <Signal1Icon color="warning" />;
  return <Signal0Icon color="error" />;
}

function getSecurityIcon(security: string) {
  if (security === 'open' || security === 'none') {
    return <LockOpenIcon color="warning" />;
  }
  return <LockIcon color="success" />;
}

export default function NetworkPanel() {
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Network state
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [wifiNetworks, setWifiNetworks] = useState<WiFiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);

  // Dialog states
  const [wifiDialog, setWifiDialog] = useState<{ open: boolean; network: WiFiNetwork | null }>({ open: false, network: null });
  const [wifiPassword, setWifiPassword] = useState('');
  const [ipDialog, setIpDialog] = useState<{ open: boolean; interface: string; config: IPConfiguration | null }>({ open: false, interface: '', config: null });
  const [dnsDialog, setDnsDialog] = useState<{ open: boolean; servers: string[] }>({ open: false, servers: [] });
  const [hostnameDialog, setHostnameDialog] = useState<{ open: boolean; hostname: string }>({ open: false, hostname: '' });

  const fetchNetworkStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await networkApi.getStatus();
      setNetworkStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch network status');
    } finally {
      setLoading(false);
    }
  }, []);

  const scanWifiNetworks = useCallback(async () => {
    try {
      setScanning(true);
      const networks = await networkApi.scanWifi();
      setWifiNetworks(networks.networks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan WiFi networks');
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    fetchNetworkStatus();
  }, [fetchNetworkStatus]);

  const handleConnectWifi = async () => {
    if (!wifiDialog.network) return;
    try {
      setLoading(true);
      await networkApi.connectWifi(wifiDialog.network.ssid, wifiPassword);
      setSuccess(`Connected to ${wifiDialog.network.ssid}`);
      setWifiDialog({ open: false, network: null });
      setWifiPassword('');
      await fetchNetworkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to WiFi');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectWifi = async (iface: string) => {
    try {
      setLoading(true);
      await networkApi.disconnectWifi(iface);
      setSuccess('WiFi disconnected');
      await fetchNetworkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect WiFi');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDHCP = async (iface: string, enabled: boolean) => {
    try {
      setLoading(true);
      await networkApi.setDHCP(iface, enabled);
      setSuccess(`${enabled ? 'DHCP enabled' : 'Static IP configured'} on ${iface}`);
      await fetchNetworkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to configure DHCP');
    } finally {
      setLoading(false);
    }
  };

  const handleSetStaticIP = async (iface: string, config: IPConfiguration) => {
    try {
      setLoading(true);
      await networkApi.setStaticIP(iface, config);
      setSuccess(`Static IP configured on ${iface}`);
      setIpDialog({ open: false, interface: '', config: null });
      await fetchNetworkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set static IP');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDNS = async (servers: string[]) => {
    try {
      setLoading(true);
      await networkApi.setDNS(servers);
      setSuccess('DNS servers updated');
      setDnsDialog({ open: false, servers: [] });
      await fetchNetworkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set DNS servers');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleInterface = async (iface: string, enable: boolean) => {
    try {
      setLoading(true);
      await networkApi.toggleInterface(iface, enable);
      setSuccess(`Interface ${iface} ${enable ? 'enabled' : 'disabled'}`);
      await fetchNetworkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${enable ? 'enable' : 'disable'} interface`);
    } finally {
      setLoading(false);
    }
  };

  const handleServiceAction = async (service: string, action: 'start' | 'stop' | 'restart' | 'enable' | 'disable') => {
    try {
      setLoading(true);
      await networkApi.serviceAction(service, action);
      setSuccess(`Service ${service} ${action}ed`);
      await fetchNetworkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} service`);
    } finally {
      setLoading(false);
    }
  };

  const handleSetHostname = async (hostname: string) => {
    try {
      setLoading(true);
      await networkApi.setHostname(hostname);
      setSuccess(`Hostname changed to ${hostname}`);
      setHostnameDialog({ open: false, hostname: '' });
      await fetchNetworkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change hostname');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !networkStatus) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <RouterIcon color="primary" />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Network Configuration
        </Typography>
        {networkStatus?.internet_connected ? (
          <Chip icon={<CloudIcon />} label="Internet Connected" color="success" size="small" />
        ) : (
          <Chip icon={<CloudOffIcon />} label="No Internet" color="error" size="small" />
        )}
        <IconButton onClick={fetchNetworkStatus} disabled={loading} size="small">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Divider />

      {/* Tabs */}
      <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} variant="fullWidth">
        <Tab icon={<EthernetIcon />} label="Ethernet" />
        <Tab icon={<WifiIcon />} label="WiFi" />
        <Tab icon={<PublicIcon />} label="IP & DNS" />
        <Tab icon={<SecurityIcon />} label="Services" />
      </Tabs>

      {/* Alerts */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ m: 2 }}>
          {success}
        </Alert>
      )}

      {loading && <LinearProgress />}

      {/* Tab Panels */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {/* Ethernet Tab */}
        <TabPanel value={tabIndex} index={0}>
          <Grid container spacing={2}>
            {networkStatus?.ethernet?.map((eth) => (
              <Grid item xs={12} md={6} key={eth.name}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <EthernetIcon color={eth.connected ? 'success' : 'disabled'} />
                      <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        {eth.name}
                      </Typography>
                      <Chip
                        icon={eth.connected ? <LinkIcon /> : <LinkOffIcon />}
                        label={eth.connected ? 'Connected' : 'Disconnected'}
                        color={eth.connected ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>

                    <List dense>
                      <ListItem>
                        <ListItemText primary="MAC Address" secondary={eth.mac_address} />
                      </ListItem>
                      {eth.ip_address && (
                        <ListItem>
                          <ListItemText primary="IP Address" secondary={eth.ip_address} />
                        </ListItem>
                      )}
                      {eth.gateway && (
                        <ListItem>
                          <ListItemText primary="Gateway" secondary={eth.gateway} />
                        </ListItem>
                      )}
                      <ListItem>
                        <ListItemText primary="Speed" secondary={eth.speed || 'N/A'} />
                      </ListItem>
                      <ListItem>
                        <ListItemText primary="DHCP" secondary={eth.dhcp ? 'Enabled' : 'Static'} />
                      </ListItem>
                    </List>
                  </CardContent>
                  <CardActions>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={eth.enabled}
                          onChange={(e) => handleToggleInterface(eth.name, e.target.checked)}
                          disabled={loading}
                        />
                      }
                      label="Enabled"
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    <Button
                      size="small"
                      startIcon={<SettingsIcon />}
                      onClick={() => setIpDialog({
                        open: true,
                        interface: eth.name,
                        config: {
                          ip_address: eth.ip_address || '',
                          netmask: eth.netmask || '255.255.255.0',
                          gateway: eth.gateway || '',
                          dhcp: eth.dhcp
                        }
                      })}
                    >
                      Configure
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            )) || (
              <Grid item xs={12}>
                <Alert severity="info">No Ethernet interfaces detected</Alert>
              </Grid>
            )}
          </Grid>
        </TabPanel>

        {/* WiFi Tab */}
        <TabPanel value={tabIndex} index={1}>
          {/* Current WiFi Connection */}
          {networkStatus?.wifi?.map((wifi) => (
            <Card variant="outlined" sx={{ mb: 2 }} key={wifi.name}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  {wifi.connected ? <WifiIcon color="success" /> : <WifiOffIcon color="disabled" />}
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    {wifi.name} - {wifi.ssid || 'Not Connected'}
                  </Typography>
                  {wifi.connected && wifi.signal_strength !== undefined && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {getSignalIcon(wifi.signal_strength)}
                      <Typography variant="body2">{wifi.signal_strength}%</Typography>
                    </Box>
                  )}
                </Box>

                {wifi.connected && (
                  <List dense>
                    <ListItem>
                      <ListItemText primary="IP Address" secondary={wifi.ip_address} />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Security" secondary={wifi.security || 'Unknown'} />
                    </ListItem>
                  </List>
                )}
              </CardContent>
              <CardActions>
                <FormControlLabel
                  control={
                    <Switch
                      checked={wifi.enabled}
                      onChange={(e) => handleToggleInterface(wifi.name, e.target.checked)}
                      disabled={loading}
                    />
                  }
                  label="Enabled"
                />
                <Box sx={{ flexGrow: 1 }} />
                {wifi.connected && (
                  <Button
                    size="small"
                    color="warning"
                    startIcon={<WifiOffIcon />}
                    onClick={() => handleDisconnectWifi(wifi.name)}
                    disabled={loading}
                  >
                    Disconnect
                  </Button>
                )}
              </CardActions>
            </Card>
          ))}

          {/* Available Networks */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <ScanIcon />
                <Typography sx={{ flexGrow: 1 }}>Available Networks</Typography>
                <Button
                  size="small"
                  startIcon={scanning ? <CircularProgress size={16} /> : <RefreshIcon />}
                  onClick={scanWifiNetworks}
                  disabled={scanning}
                >
                  Scan
                </Button>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {wifiNetworks.length > 0 ? (
                <List>
                  {wifiNetworks.map((network, idx) => (
                    <ListItem
                      key={idx}
                      secondaryAction={
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setWifiDialog({ open: true, network })}
                          disabled={loading}
                        >
                          Connect
                        </Button>
                      }
                    >
                      <ListItemIcon>
                        {getSignalIcon(network.signal_strength)}
                      </ListItemIcon>
                      <ListItemText
                        primary={network.ssid}
                        secondary={`${network.security} - ${network.signal_strength}%`}
                      />
                      <ListItemIcon>
                        {getSecurityIcon(network.security)}
                      </ListItemIcon>
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Alert severity="info">
                  Click Scan to discover available WiFi networks
                </Alert>
              )}
            </AccordionDetails>
          </Accordion>
        </TabPanel>

        {/* IP & DNS Tab */}
        <TabPanel value={tabIndex} index={2}>
          <Grid container spacing={2}>
            {/* DNS Configuration */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <DnsIcon color="primary" />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                      DNS Servers
                    </Typography>
                  </Box>
                  <List dense>
                    {networkStatus?.dns_servers?.map((dns, idx) => (
                      <ListItem key={idx}>
                        <ListItemText primary={dns} secondary={idx === 0 ? 'Primary' : 'Secondary'} />
                      </ListItem>
                    )) || (
                      <ListItem>
                        <ListItemText primary="Using DHCP DNS" secondary="Automatic" />
                      </ListItem>
                    )}
                  </List>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => setDnsDialog({
                      open: true,
                      servers: networkStatus?.dns_servers || ['8.8.8.8', '8.8.4.4']
                    })}
                  >
                    Configure DNS
                  </Button>
                </CardActions>
              </Card>
            </Grid>

            {/* Hostname */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <NetworkCheckIcon color="primary" />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                      System Identity
                    </Typography>
                  </Box>
                  <List dense>
                    <ListItem>
                      <ListItemText primary="Hostname" secondary={networkStatus?.hostname || 'Unknown'} />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Domain" secondary={networkStatus?.domain || 'local'} />
                    </ListItem>
                  </List>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => setHostnameDialog({
                      open: true,
                      hostname: networkStatus?.hostname || ''
                    })}
                  >
                    Change Hostname
                  </Button>
                </CardActions>
              </Card>
            </Grid>

            {/* Routing Table */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <RouterIcon />
                    <Typography>Routing Table</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Destination</TableCell>
                        <TableCell>Gateway</TableCell>
                        <TableCell>Interface</TableCell>
                        <TableCell>Metric</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {networkStatus?.routes?.map((route, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{route.destination}</TableCell>
                          <TableCell>{route.gateway}</TableCell>
                          <TableCell>{route.interface}</TableCell>
                          <TableCell>{route.metric}</TableCell>
                        </TableRow>
                      )) || (
                        <TableRow>
                          <TableCell colSpan={4}>No routes available</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </AccordionDetails>
              </Accordion>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Services Tab */}
        <TabPanel value={tabIndex} index={3}>
          <Grid container spacing={2}>
            {networkStatus?.services?.map((service) => (
              <Grid item xs={12} md={6} key={service.name}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      {service.name === 'firewalld' ? <FirewallIcon /> : <SettingsIcon />}
                      <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
                        {service.display_name || service.name}
                      </Typography>
                      <Chip
                        icon={service.running ? <OkIcon /> : <ErrorIcon />}
                        label={service.running ? 'Running' : 'Stopped'}
                        color={service.running ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {service.description}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                      <Chip
                        label={service.enabled ? 'Enabled at boot' : 'Disabled at boot'}
                        size="small"
                        variant="outlined"
                        color={service.enabled ? 'success' : 'default'}
                      />
                    </Box>
                  </CardContent>
                  <CardActions>
                    {service.running ? (
                      <>
                        <Button
                          size="small"
                          color="warning"
                          onClick={() => handleServiceAction(service.name, 'stop')}
                          disabled={loading}
                        >
                          Stop
                        </Button>
                        <Button
                          size="small"
                          onClick={() => handleServiceAction(service.name, 'restart')}
                          disabled={loading}
                        >
                          Restart
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="small"
                        color="success"
                        onClick={() => handleServiceAction(service.name, 'start')}
                        disabled={loading}
                      >
                        Start
                      </Button>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={service.enabled}
                          onChange={(e) => handleServiceAction(service.name, e.target.checked ? 'enable' : 'disable')}
                          disabled={loading}
                          size="small"
                        />
                      }
                      label="Boot"
                    />
                  </CardActions>
                </Card>
              </Grid>
            )) || (
              <Grid item xs={12}>
                <Alert severity="info">No network services information available</Alert>
              </Grid>
            )}

            {/* Firewall Zones */}
            {networkStatus?.firewall_zones && networkStatus.firewall_zones.length > 0 && (
              <Grid item xs={12}>
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FirewallIcon />
                      <Typography>Firewall Zones</Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid container spacing={2}>
                      {networkStatus.firewall_zones.map((zone) => (
                        <Grid item xs={12} md={4} key={zone.name}>
                          <Card variant="outlined">
                            <CardContent>
                              <Typography variant="subtitle1" gutterBottom>
                                {zone.name}
                                {zone.default && <Chip label="Default" size="small" sx={{ ml: 1 }} />}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" gutterBottom>
                                {zone.description}
                              </Typography>
                              {zone.services.length > 0 && (
                                <Box sx={{ mt: 1 }}>
                                  <Typography variant="caption" color="text.secondary">
                                    Allowed Services:
                                  </Typography>
                                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                    {zone.services.map((svc) => (
                                      <Chip key={svc} label={svc} size="small" variant="outlined" />
                                    ))}
                                  </Box>
                                </Box>
                              )}
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  </AccordionDetails>
                </Accordion>
              </Grid>
            )}
          </Grid>
        </TabPanel>
      </Box>

      {/* WiFi Connect Dialog */}
      <Dialog open={wifiDialog.open} onClose={() => setWifiDialog({ open: false, network: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Connect to {wifiDialog.network?.ssid}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              {wifiDialog.network && getSignalIcon(wifiDialog.network.signal_strength)}
              <Typography>Signal: {wifiDialog.network?.signal_strength}%</Typography>
              <Box sx={{ flexGrow: 1 }} />
              {wifiDialog.network && getSecurityIcon(wifiDialog.network.security)}
              <Typography>{wifiDialog.network?.security}</Typography>
            </Box>
            {wifiDialog.network?.security !== 'open' && wifiDialog.network?.security !== 'none' && (
              <TextField
                fullWidth
                type="password"
                label="Password"
                value={wifiPassword}
                onChange={(e) => setWifiPassword(e.target.value)}
                autoFocus
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setWifiDialog({ open: false, network: null }); setWifiPassword(''); }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConnectWifi}
            disabled={loading || (wifiDialog.network?.security !== 'open' && wifiDialog.network?.security !== 'none' && !wifiPassword)}
          >
            Connect
          </Button>
        </DialogActions>
      </Dialog>

      {/* IP Configuration Dialog */}
      <Dialog open={ipDialog.open} onClose={() => setIpDialog({ open: false, interface: '', config: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Configure {ipDialog.interface}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={ipDialog.config?.dhcp ?? true}
                  onChange={(e) => {
                    if (ipDialog.config) {
                      setIpDialog({
                        ...ipDialog,
                        config: { ...ipDialog.config, dhcp: e.target.checked }
                      });
                    }
                  }}
                />
              }
              label="Use DHCP (Automatic)"
            />
            {!ipDialog.config?.dhcp && (
              <>
                <TextField
                  fullWidth
                  label="IP Address"
                  value={ipDialog.config?.ip_address || ''}
                  onChange={(e) => {
                    if (ipDialog.config) {
                      setIpDialog({
                        ...ipDialog,
                        config: { ...ipDialog.config, ip_address: e.target.value }
                      });
                    }
                  }}
                  placeholder="192.168.1.100"
                />
                <TextField
                  fullWidth
                  label="Subnet Mask"
                  value={ipDialog.config?.netmask || ''}
                  onChange={(e) => {
                    if (ipDialog.config) {
                      setIpDialog({
                        ...ipDialog,
                        config: { ...ipDialog.config, netmask: e.target.value }
                      });
                    }
                  }}
                  placeholder="255.255.255.0"
                />
                <TextField
                  fullWidth
                  label="Gateway"
                  value={ipDialog.config?.gateway || ''}
                  onChange={(e) => {
                    if (ipDialog.config) {
                      setIpDialog({
                        ...ipDialog,
                        config: { ...ipDialog.config, gateway: e.target.value }
                      });
                    }
                  }}
                  placeholder="192.168.1.1"
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIpDialog({ open: false, interface: '', config: null })}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (ipDialog.config) {
                if (ipDialog.config.dhcp) {
                  handleSetDHCP(ipDialog.interface, true);
                  setIpDialog({ open: false, interface: '', config: null });
                } else {
                  handleSetStaticIP(ipDialog.interface, ipDialog.config);
                }
              }
            }}
            disabled={loading}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      {/* DNS Configuration Dialog */}
      <Dialog open={dnsDialog.open} onClose={() => setDnsDialog({ open: false, servers: [] })} maxWidth="sm" fullWidth>
        <DialogTitle>Configure DNS Servers</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Primary DNS"
              value={dnsDialog.servers[0] || ''}
              onChange={(e) => {
                const newServers = [...dnsDialog.servers];
                newServers[0] = e.target.value;
                setDnsDialog({ ...dnsDialog, servers: newServers });
              }}
              placeholder="8.8.8.8"
            />
            <TextField
              fullWidth
              label="Secondary DNS"
              value={dnsDialog.servers[1] || ''}
              onChange={(e) => {
                const newServers = [...dnsDialog.servers];
                newServers[1] = e.target.value;
                setDnsDialog({ ...dnsDialog, servers: newServers });
              }}
              placeholder="8.8.4.4"
            />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" onClick={() => setDnsDialog({ ...dnsDialog, servers: ['8.8.8.8', '8.8.4.4'] })}>
                Google DNS
              </Button>
              <Button size="small" variant="outlined" onClick={() => setDnsDialog({ ...dnsDialog, servers: ['1.1.1.1', '1.0.0.1'] })}>
                Cloudflare DNS
              </Button>
              <Button size="small" variant="outlined" onClick={() => setDnsDialog({ ...dnsDialog, servers: ['9.9.9.9', '149.112.112.112'] })}>
                Quad9 DNS
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDnsDialog({ open: false, servers: [] })}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => handleSetDNS(dnsDialog.servers.filter(s => s))}
            disabled={loading || dnsDialog.servers.filter(s => s).length === 0}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      {/* Hostname Configuration Dialog */}
      <Dialog open={hostnameDialog.open} onClose={() => setHostnameDialog({ open: false, hostname: '' })} maxWidth="sm" fullWidth>
        <DialogTitle>Change Hostname</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Hostname"
              value={hostnameDialog.hostname}
              onChange={(e) => setHostnameDialog({ ...hostnameDialog, hostname: e.target.value })}
              placeholder="my-device"
              helperText="Enter a valid hostname (letters, numbers, hyphens only)"
            />
            <Alert severity="warning">
              Changing the hostname requires a system restart to take full effect.
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHostnameDialog({ open: false, hostname: '' })}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => handleSetHostname(hostnameDialog.hostname)}
            disabled={loading || !hostnameDialog.hostname.trim()}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
