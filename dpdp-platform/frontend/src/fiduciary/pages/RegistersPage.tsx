import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { RecipientsTab } from "../components/registers/RecipientsTab";
import { SharingTab } from "../components/registers/SharingTab";
import { TransfersTab } from "../components/registers/TransfersTab";
import { RetentionTab } from "../components/registers/RetentionTab";
import { SecurityMeasuresTab } from "../components/registers/SecurityMeasuresTab";

/**
 * `/app/registers` (spec line 854): five compliance registers, one tab
 * each. Every tab owns its own data fetching/mutations -- this page is
 * only the tab shell.
 */
export function RegistersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Registers</h1>
        <p className="text-sm text-muted-foreground">
          The compliance registers: who personal data is shared with, where it crosses
          borders, how long it is kept, and how it is secured.
        </p>
      </div>

      <Tabs defaultValue="recipients">
        <TabsList>
          <TabsTrigger value="recipients">Processors &amp; Recipients</TabsTrigger>
          <TabsTrigger value="sharing">Sharing Activities</TabsTrigger>
          <TabsTrigger value="transfers">Cross-Border Transfers</TabsTrigger>
          <TabsTrigger value="retention">Retention Policies</TabsTrigger>
          <TabsTrigger value="security">Security Measures</TabsTrigger>
        </TabsList>
        <TabsContent value="recipients">
          <RecipientsTab />
        </TabsContent>
        <TabsContent value="sharing">
          <SharingTab />
        </TabsContent>
        <TabsContent value="transfers">
          <TransfersTab />
        </TabsContent>
        <TabsContent value="retention">
          <RetentionTab />
        </TabsContent>
        <TabsContent value="security">
          <SecurityMeasuresTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
