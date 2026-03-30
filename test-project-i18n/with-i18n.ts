
      import { t } from 'i18next';
      import { useIntl } from 'react-intl';

      export function WelcomeMessage() {
        const intl = useIntl();
        return intl.formatMessage({ id: 'welcome.title' });
      }
    